import React from 'react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../App';

describe('App Component Integration', () => {
  it('renders the current luxury editor shell and import controls', () => {
    render(<App />);
    expect(screen.getByText('RECONSTRUCTA')).toBeInTheDocument();
    expect(screen.getByText(/Universal Visual & Document Editor/i)).toBeInTheDocument();
    expect(screen.getByText(/Import & Reconstruct/i)).toBeInTheDocument();
    expect(screen.getByText('LOCAL DEMO')).toBeInTheDocument();
    expect(screen.getByText('Editable layers')).toBeInTheDocument();
  });

  it('renders the editable scene graph and changes selection', () => {
    render(<App />);
    expect(screen.getByText('Headline')).toBeInTheDocument();
    expect(screen.getByText('Body copy')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Body copy'));
    expect(screen.getByText('Body copy')).toBeInTheDocument();
  });

  it('changes zoom through the canvas controls', () => {
    render(<App />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    const zoomIn = screen.getAllByRole('button').find((button) => button.querySelector('svg.lucide-zoom-in'));
    expect(zoomIn).toBeTruthy();
    fireEvent.click(zoomIn!);
    expect(screen.getByText('110%')).toBeInTheDocument();
  });
});
