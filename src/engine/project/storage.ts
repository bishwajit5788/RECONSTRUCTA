/**
 * RECONSTRUCTA — INDEXEDDB PROJECT STORAGE & VERSIONING ENGINE
 * Provides crash-resilient local persistence, checkpoint versioning,
 * autosave recovery, and .reconstructa project file import/export.
 */

import { openDB, IDBPDatabase } from 'idb';
import { ReconstructaProject, ProjectVersion, ProjectAsset } from '../../types/project';
import { SceneGraph } from '../../types/sceneGraph';

const DB_NAME = 'reconstructa_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_ACTIVE_SESSION = 'active_session';

export class ProjectStorage {
  private static dbPromise: Promise<IDBPDatabase> | null = null;

  private static getDB(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
            db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_ACTIVE_SESSION)) {
            db.createObjectStore(STORE_ACTIVE_SESSION);
          }
        }
      });
    }
    return this.dbPromise;
  }

  /**
   * Saves or updates a project in IndexedDB
   */
  static async saveProject(project: ReconstructaProject): Promise<void> {
    const db = await this.getDB();
    project.updatedAt = Date.now();
    await db.put(STORE_PROJECTS, project);
    await db.put(STORE_ACTIVE_SESSION, project.id, 'current_project_id');
  }

  /**
   * Loads a project by ID
   */
  static async loadProject(id: string): Promise<ReconstructaProject | null> {
    const db = await this.getDB();
    const proj = await db.get(STORE_PROJECTS, id);
    return proj || null;
  }

  /**
   * Lists all local projects sorted by last updated
   */
  static async listProjects(): Promise<ReconstructaProject[]> {
    const db = await this.getDB();
    const all = await db.getAll(STORE_PROJECTS);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Deletes a project
   */
  static async deleteProject(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(STORE_PROJECTS, id);
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
   * Imports a project from a .reconstructa file
   */
  static async importProjectFile(file: File): Promise<ReconstructaProject> {
    const text = await file.text();
    const parsed = JSON.parse(text) as ReconstructaProject;

    // Schema validation and migration
    if (!parsed.schemaVersion || parsed.schemaVersion < 1) {
      parsed.schemaVersion = 1;
    }
    if (!parsed.id) {
      parsed.id = `proj_${Date.now()}`;
    }
    if (!parsed.versions) {
      parsed.versions = [];
    }

    await this.saveProject(parsed);
    return parsed;
  }
}
