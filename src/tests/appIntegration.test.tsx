/**
 * RECONSTRUCTA — APP COMPONENT INTEGRATION TEST
 * Verifies rendering of luxury UI, demo loading, layer tree population, and export dialog triggering.
 */

import React, { act } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../App';

describe('App Component Integration', () => {
  it('renders brand header, empty state banner, and import controls', () => {
    render(<App />);

    expect(screen.getByText('RECONSTRUCTA')).toBeInTheDocument();
    expect(screen.getByText(/Visual & Document Workstation/i)).toBeInTheDocument();
    expect(screen.getByText('IMPORT VISUAL OR DOCUMENT')).toBeInTheDocument();
    expect(screen.getByText('Load Interactive Demo')).toBeInTheDocument();
  });

  it('loads interactive demo and populates scene graph and layers', async () => {
    render(<App />);

    const loadDemoBtn = screen.getByText('Load Interactive Demo');
    await act(async () => {
      fireEvent.click(loadDemoBtn);
    });

    // Verify layer tree contains demo elements
    expect(screen.getByText(/Contact Name/i)).toBeInTheDocument();
    expect(screen.getByText(/Received Bubble/i)).toBeInTheDocument();
    expect(screen.getByText(/Message Text/i)).toBeInTheDocument();
  });

  it('opens export dialog when export button is clicked', async () => {
    render(<App />);

    const exportBtn = screen.getByTitle(/Export High-Res Image or PDF/i);
    await act(async () => {
      fireEvent.click(exportBtn);
    });

    expect(screen.getByText('EXPORT SPECIFICATION')).toBeInTheDocument();
    expect(screen.getByText('Provenance Indicator')).toBeInTheDocument();
  });
});
