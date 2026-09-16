import { useEffect, useId } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { parseTournamentDescription, serializeTournamentDescription, tournamentDescriptionDocument } from '../lib/tournament-description.js';

const extensions = [StarterKit.configure({
  blockquote: false,
  bulletList: false,
  code: false,
  codeBlock: false,
  hardBreak: false,
  heading: false,
  horizontalRule: false,
  listItem: false,
  orderedList: false,
  strike: false,
})];

export function TournamentDescriptionEditor({ label, value, onChange, boldLabel, italicLabel }) {
  const editorId = useId();
  const editor = useEditor({
    extensions,
    content: tournamentDescriptionDocument(value),
    editorProps: { attributes: { id: editorId, 'aria-label': label } },
    onUpdate: ({ editor: currentEditor }) => onChange(serializeTournamentDescription(currentEditor.getJSON())),
  });

  useEffect(() => {
    if (!editor) return;
    const nextContent = parseTournamentDescription(value);
    if (!nextContent) return;
    if (serializeTournamentDescription(editor.getJSON()) !== value) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="tournament-description-editor">
      <span className="tournament-description-editor-label">{label}</span>
      <div className="tournament-description-editor-toolbar" role="toolbar" aria-label={label}>
        <button
          type="button"
          className="tournament-description-editor-button"
          aria-label={boldLabel}
          aria-pressed={editor.isActive('bold')}
          title={boldLabel}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong aria-hidden="true">B</strong>
        </button>
        <button
          type="button"
          className="tournament-description-editor-button"
          aria-label={italicLabel}
          aria-pressed={editor.isActive('italic')}
          title={italicLabel}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em aria-hidden="true">I</em>
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
