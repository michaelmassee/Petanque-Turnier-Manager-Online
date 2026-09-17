import { useEffect, useId } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { parseRichText, serializeRichText, richTextDocument } from '../lib/rich-text.js';

const extensions = [StarterKit.configure({
  blockquote: false,
  bulletList: true,
  code: false,
  codeBlock: false,
  hardBreak: false,
  heading: { levels: [2] },
  horizontalRule: false,
  listItem: true,
  link: false,
  orderedList: true,
  strike: true,
  underline: true,
})];

export function RichTextEditor({ label, value, onChange, boldLabel, italicLabel, underlineLabel, strikeLabel, bulletListLabel, orderedListLabel, headingLabel }) {
  const editorId = useId();
  const editor = useEditor({
    extensions,
    content: richTextDocument(value),
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { id: editorId, 'aria-label': label } },
    onUpdate: ({ editor: currentEditor }) => onChange(serializeRichText(currentEditor.getJSON())),
  });

  useEffect(() => {
    if (!editor) return;
    const nextContent = parseRichText(value);
    if (!nextContent) return;
    if (serializeRichText(editor.getJSON()) !== value) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div className="rich-text-editor">
      <span className="rich-text-editor-label">{label}</span>
      <div className="rich-text-editor-toolbar" role="toolbar" aria-label={label}>
        <button
          type="button"
          className="rich-text-editor-button"
          aria-label={boldLabel}
          aria-pressed={editor?.isActive('bold') || false}
          title={boldLabel}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <strong aria-hidden="true">B</strong>
        </button>
        <button
          type="button"
          className="rich-text-editor-button"
          aria-label={italicLabel}
          aria-pressed={editor?.isActive('italic') || false}
          title={italicLabel}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <em aria-hidden="true">I</em>
        </button>
        <button type="button" className="rich-text-editor-button" aria-label={underlineLabel} aria-pressed={editor?.isActive('underline') || false} title={underlineLabel} disabled={!editor} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <u aria-hidden="true">U</u>
        </button>
        <button type="button" className="rich-text-editor-button" aria-label={strikeLabel} aria-pressed={editor?.isActive('strike') || false} title={strikeLabel} disabled={!editor} onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <s aria-hidden="true">S</s>
        </button>
        <button type="button" className="rich-text-editor-button" aria-label={bulletListLabel} aria-pressed={editor?.isActive('bulletList') || false} title={bulletListLabel} disabled={!editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <span aria-hidden="true">•</span>
        </button>
        <button type="button" className="rich-text-editor-button" aria-label={orderedListLabel} aria-pressed={editor?.isActive('orderedList') || false} title={orderedListLabel} disabled={!editor} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <span aria-hidden="true">1.</span>
        </button>
        <button type="button" className="rich-text-editor-button" aria-label={headingLabel} aria-pressed={editor?.isActive('heading', { level: 2 }) || false} title={headingLabel} disabled={!editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <strong aria-hidden="true">H</strong>
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
