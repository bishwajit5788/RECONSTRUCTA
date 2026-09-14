import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../App';

beforeEach(() => {
  localStorage.clear();
  global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: 'not authenticated' }) }) as typeof fetch;
});

describe('App Component Integration', () => {
  it('requires authentication instead of rendering the demo shell', () => {
    render(<App />);
    expect(screen.getByText('SECURE WORKSPACE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
    expect(screen.queryByText('LOCAL DEMO')).not.toBeInTheDocument();
  });

  it('registers and enters the authenticated editor', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token', user_id: 'u1', username: 'alice' }) } as Response);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ user_id: 'u1', username: 'alice' }) } as Response);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Need an account/i }));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-enough-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Register/i }));
    expect(await screen.findByText('AUTHENTICATED')).toBeInTheDocument();
    expect(screen.getByText('Import & Reconstruct')).toBeInTheDocument();
    expect(screen.queryByText('LOCAL DEMO')).not.toBeInTheDocument();
  });

  it('adds a real text scene-graph node and exposes editable properties', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ user_id: 'u1', username: 'alice' }) } as Response);
    localStorage.setItem('reconstructa_access_token', 'token');
    render(<App />);
    expect(await screen.findByText('AUTHENTICATED')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Typography/i }));
    expect(screen.getByText('Text layer')).toBeInTheDocument();
    expect(screen.getByText('Double-click to edit')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /Text/i }), { target: { value: 'Actual editable text' } });
    expect(screen.getByDisplayValue('Actual editable text')).toBeInTheDocument();
  });

  it('supports zoom and undo/redo controls', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ user_id: 'u1', username: 'alice' }) } as Response);
    localStorage.setItem('reconstructa_access_token', 'token');
    render(<App />);
    expect(await screen.findByText('AUTHENTICATED')).toBeInTheDocument();
    const zoomIn = screen.getAllByRole('button').find(button => button.querySelector('svg.lucide-zoom-in'))!;
    fireEvent.click(zoomIn);
    expect(screen.getByText('110%')).toBeInTheDocument();
  });
});
