import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditDialog, ListToolbar } from './App.jsx';

describe('EditDialog', () => {
  it('rendert nichts, wenn open=false', () => {
    const { container } = render(
      <EditDialog open={false} title="Titel" onClose={() => {}}>
        <p>Inhalt</p>
      </EditDialog>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('rendert Titel und Inhalt, wenn offen', () => {
    render(
      <EditDialog open title="Mein Titel" onClose={() => {}}>
        <p>Mein Inhalt</p>
      </EditDialog>,
    );
    expect(screen.getByText('Mein Titel')).toBeInTheDocument();
    expect(screen.getByText('Mein Inhalt')).toBeInTheDocument();
  });

  it('ruft onClose bei Klick auf das Backdrop auf', () => {
    const onClose = vi.fn();
    render(
      <EditDialog open title="Titel" onClose={onClose}>
        <p>Inhalt</p>
      </EditDialog>,
    );
    fireEvent.click(document.querySelector('.modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ruft onClose bei Klick auf den Schließen-Button auf', () => {
    const onClose = vi.fn();
    render(
      <EditDialog open title="Titel" onClose={onClose}>
        <p>Inhalt</p>
      </EditDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('schließt nicht bei Klick innerhalb des Panels', () => {
    const onClose = vi.fn();
    render(
      <EditDialog open title="Titel" onClose={onClose}>
        <p>Inhalt</p>
      </EditDialog>,
    );
    fireEvent.click(screen.getByText('Inhalt'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ListToolbar', () => {
  it('ruft onQueryChange bei Texteingabe auf', () => {
    const onQueryChange = vi.fn();
    render(
      <ListToolbar
        query=""
        onQueryChange={onQueryChange}
        searchPlaceholder="Suchen"
        filters={[]}
        onReset={() => {}}
        resetDisabled
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Suchen'), { target: { value: 'abc' } });
    expect(onQueryChange).toHaveBeenCalledWith('abc');
  });

  it('ruft das onChange des passenden Filters auf', () => {
    const onFilterChange = vi.fn();
    render(
      <ListToolbar
        query=""
        onQueryChange={() => {}}
        searchPlaceholder="Suchen"
        filters={[{ label: 'Status filtern', value: '', onChange: onFilterChange, options: [{ value: 'a', label: 'A' }] }]}
        onReset={() => {}}
        resetDisabled
      />,
    );
    fireEvent.change(screen.getByLabelText('Status filtern'), { target: { value: 'a' } });
    expect(onFilterChange).toHaveBeenCalledWith('a');
  });

  it('ruft onReset bei Klick auf Filter zurücksetzen auf', () => {
    const onReset = vi.fn();
    render(
      <ListToolbar
        query="x"
        onQueryChange={() => {}}
        searchPlaceholder="Suchen"
        filters={[]}
        onReset={onReset}
        resetDisabled={false}
      />,
    );
    fireEvent.click(screen.getByText('Filter zurücksetzen'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
