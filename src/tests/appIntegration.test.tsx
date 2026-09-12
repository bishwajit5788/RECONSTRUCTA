import React from 'react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../App';

describe('App Component Integration', () => {
  it('renders the current luxury editor shell and import controls', () => {
    render(<App />);
    expect(screen.getAllByText('RECONSTRUCTA').length).toBeGreaterThan(0);
    expect(screen.getByText(/Universal Visual & Document Editor/i)).toBeInTheDocument();
    expect(screen.getByText(/Import & Reconstruct/i)).toBeInTheDocument();
    expect(screen.getByText('LOCAL DEMO')).toBeInTheDocument();
    expect(screen.getByText('Editable layers')).toBeInTheDocument();
  });

  it('renders the editable scene graph and changes selection', () => {
    render(<App />);
    expect(screen.getAllByText('Headline').length).toBeGreaterThan(0);
    const bodyCopy = screen.getAllByText('Body copy')[0];
    expect(bodyCopy).toBeInTheDocument();
    fireEvent.click(bodyCopy);
    expect(bodyCopy).toBeInTheDocument();
  });

  it('changes zoom through the canvas controls', () => {
    render(<App />);
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    const zoomIn = screen.getAllByRole('button').find((button) => button.querySelector('svg.lucide-zoom-in'));
    expect(zoomIn).toBeTruthy();
    fireEvent.click(zoomIn!);
    expect(screen.getAllByText('110%').length).toBeGreaterThan(0);
  });
});
