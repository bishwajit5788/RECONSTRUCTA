/**
 * RECONSTRUCTA — INDEXEDDB PROJECT STORAGE & VERSIONING ENGINE
 * Provides crash-resilient local persistence, strict schema validation for imports,
 * named checkpoint versioning, debounced autosave snapshots, and 2-hour client-side retention sweeps.
 */

import { openDB, IDBPDatabase } from 'idb';
import { ReconstructaProject, ProjectVersion } from '../../types/project';
import { SceneGraph } from '../../types/sceneGraph';

const DB_NAME = 'reconstructa_db';
const DB_VERSION = 2;
const STORE_PROJECTS = 'projects';
const STORE_ACTIVE_SESSION = 'active_session';
const RETENTION_MS = 2 * 3600 * 1000; // Exactly 2 Hours

export class ProjectStorage {
  private static dbPromise: Promise<IDBPDatabase | null> | null = null;
  private static memoryProjects: Map<string, ReconstructaProject> = new Map();
  private static memorySession: Map<string, any> = new Map();

  private static isIndexedDBAvailable(): boolean {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  private static getDB(): Promise<IDBPDatabase | null> {
    if (!this.isIndexedDBAvailable()) {
      return Promise.resolve(null);
    }
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db, _oldVersion) {
          if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
            db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_ACTIVE_SESSION)) {
            db.createObjectStore(STORE_ACTIVE_SESSION);
          }
        }
      }).catch(() => null);
    }
    return this.dbPromise;
  }

  /**
   * Validates project schema structure before import
   */
  static validateProjectSchema(data: any): { valid: boolean; error?: string } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Project payload must be a JSON object.' };
    }

    if (!data.id || typeof data.id !== 'string') {
      return { valid: false, error: 'Invalid or missing project ID.' };
    }

    if (!data.sceneGraph || typeof data.sceneGraph !== 'object') {
      return { valid: false, error: 'Project is missing required sceneGraph structure.' };
    }

    const { nodes, rootIds, canvasWidth, canvasHeight } = data.sceneGraph;
    if (!nodes || typeof nodes !== 'object') {
      return { valid: false, error: 'sceneGraph.nodes must be a dictionary of layer nodes.' };
    }

    if (!Array.isArray(rootIds)) {
      return { valid: false, error: 'sceneGraph.rootIds must be an array.' };
    }

    if (typeof canvasWidth !== 'number' || typeof canvasHeight !== 'number' || canvasWidth <= 0 || canvasHeight <= 0) {
      return { valid: false, error: 'Invalid canvas dimensions specified in sceneGraph.' };
    }

    return { valid: true };
  }

  /**
   * Saves or updates a project in IndexedDB and updates the 2-hour retention timestamp
   */
  static async saveProject(project: ReconstructaProject): Promise<void> {
    project.updatedAt = Date.now();
    const db = await this.getDB();
    if (!db) {
      this.memoryProjects.set(project.id, JSON.parse(JSON.stringify(project)));
      this.memorySession.set('current_project_id', project.id);
      return;
    }
    await db.put(STORE_PROJECTS, project);
    await db.put(STORE_ACTIVE_SESSION, project.id, 'current_project_id');
  }

  /**
   * Loads a project by ID
   */
  static async loadProject(id: string): Promise<ReconstructaProject | null> {
    const db = await this.getDB();
    if (!db) {
      const proj = this.memoryProjects.get(id);
      if (!proj) return null;
      if (Date.now() - proj.updatedAt > RETENTION_MS) {
        this.memoryProjects.delete(id);
        return null;
      }
      return JSON.parse(JSON.stringify(proj));
    }
    const proj = await db.get(STORE_PROJECTS, id);
    if (!proj) return null;

    // Verify local 2-hour retention
    if (Date.now() - proj.updatedAt > RETENTION_MS) {
      await this.deleteProject(id);
      return null;
    }

    return proj;
  }

  /**
   * Lists all local projects sorted by last updated (skips expired projects)
   */
  static async listProjects(): Promise<ReconstructaProject[]> {
    const now = Date.now();
    const db = await this.getDB();
    if (!db) {
      const active: ReconstructaProject[] = [];
      for (const [id, proj] of Array.from(this.memoryProjects.entries())) {
        if (now - (proj.updatedAt || 0) <= RETENTION_MS) {
          active.push(JSON.parse(JSON.stringify(proj)));
        } else {
          this.memoryProjects.delete(id);
        }
      }
      return active.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    const all = await db.getAll(STORE_PROJECTS);

    const active: ReconstructaProject[] = [];
    for (const proj of all) {
      if (now - proj.updatedAt <= RETENTION_MS) {
        active.push(proj);
      } else {
        await this.deleteProject(proj.id);
      }
    }

    return active.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Sweeps and removes all projects older than 2 hours from client IndexedDB
   */
  static async purgeExpiredLocalProjects(): Promise<number> {
    const now = Date.now();
    let purged = 0;
    const db = await this.getDB();
    if (!db) {
      for (const [id, proj] of Array.from(this.memoryProjects.entries())) {
        if (now - (proj.updatedAt || 0) > RETENTION_MS) {
          this.memoryProjects.delete(id);
          purged++;
        }
      }
      return purged;
    }
    const all = await db.getAll(STORE_PROJECTS);

    for (const proj of all) {
      if (now - (proj.updatedAt || 0) > RETENTION_MS) {
        await db.delete(STORE_PROJECTS, proj.id);
        purged++;
      }
    }

    return purged;
  }

  /**
   * Deletes a project
   */
  static async deleteProject(id: string): Promise<void> {
    const db = await this.getDB();
    if (!db) {
      this.memoryProjects.delete(id);
      return;
    }
    await db.delete(STORE_PROJECTS, id);
  }

  /**
   * Saves active crash recovery snapshot
   */
  static async saveCrashSnapshot(sceneGraph: SceneGraph, projectName: string = 'Autosaved Project'): Promise<void> {
    const snapshot = {
      sceneGraph,
      projectName,
      timestamp: Date.now()
    };
    const db = await this.getDB();
    if (!db) {
      this.memorySession.set('crash_snapshot', snapshot);
      return;
    }
    await db.put(
      STORE_ACTIVE_SESSION,
      snapshot,
      'crash_snapshot'
    );
  }

  /**
   * Loads crash recovery snapshot if available and not expired
   */
  static async loadCrashSnapshot(): Promise<{ sceneGraph: SceneGraph; projectName: string; timestamp: number } | null> {
    const db = await this.getDB();
    let snap: any;
    if (!db) {
      snap = this.memorySession.get('crash_snapshot');
    } else {
      snap = await db.get(STORE_ACTIVE_SESSION, 'crash_snapshot');
    }
    if (!snap) return null;
    if (Date.now() - snap.timestamp > RETENTION_MS) {
      await this.clearCrashSnapshot();
      return null;
    }
    return snap;
  }

  /**
   * Clears crash recovery snapshot
   */
  static async clearCrashSnapshot(): Promise<void> {
    const db = await this.getDB();
    if (!db) {
      this.memorySession.delete('crash_snapshot');
      return;
    }
    await db.delete(STORE_ACTIVE_SESSION, 'crash_snapshot');
  }

  /**
   * Creates a new checkpoint version in the project
   */
  static createVersion(
    project: ReconstructaProject,
    versionName: string
  ): ProjectVersion {
    const newVersionNum = (project.versions.length || 0) + 1;
    const newVersion: ProjectVersion = {
      versionId: `ver_${Date.now()}_${newVersionNum}`,
      versionNumber: newVersionNum,
      name: versionName || `Version ${newVersionNum}`,
      timestamp: Date.now(),
      sceneGraphSnapshot: JSON.parse(JSON.stringify(project.sceneGraph))
    };

    project.versions.push(newVersion);
    return newVersion;
  }

  /**
   * Restores a checkpoint version into the active scene graph
   */
  static restoreVersion(project: ReconstructaProject, versionId: string): SceneGraph | null {
    const v = project.versions.find((ver) => ver.versionId === versionId);
    if (!v) return null;
    project.sceneGraph = JSON.parse(JSON.stringify(v.sceneGraphSnapshot));
    return project.sceneGraph;
  }

  /**
   * Exports project as downloadable .reconstructa JSON file
   */
  static exportProjectFile(project: ReconstructaProject): void {
    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}.reconstructa`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Imports a project from a .reconstructa file with strict schema validation
   */
  static async importProjectFile(file: File): Promise<ReconstructaProject> {
    const text = await file.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Malformed .reconstructa file. Invalid JSON payload.');
    }

    const validation = this.validateProjectSchema(parsed);
    if (!validation.valid) {
      throw new Error(`Invalid .reconstructa project schema: ${validation.error}`);
    }

    const project = parsed as ReconstructaProject;

    if (!project.schemaVersion || project.schemaVersion < 1) {
      project.schemaVersion = 1;
    }
    if (!project.versions) {
      project.versions = [];
    }

    await this.saveProject(project);
    return project;
  }
}
