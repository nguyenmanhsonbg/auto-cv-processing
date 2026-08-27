import { useEffect, useId, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';

interface RichTextEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: Readonly<{
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}>) {
  return (
    <button
      type="button"
      className={active ? 'is-active' : undefined}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  label,
  value,
  onChange,
  placeholder = '',
  required = false,
}: RichTextEditorProps) {
  const generatedId = useId();
  const editorId = `rich-text-editor-${generatedId.replace(/:/g, '')}`;
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        id: editorId,
        class: 'topcv-editor-content',
        'aria-label': label,
        'aria-required': String(required),
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor || value === editor.getHTML()) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="topcv-form-group">
      <label className="topcv-form-label" htmlFor={editorId}>
        {label} {required ? <span className="req" aria-hidden="true">*</span> : null}
      </label>
      <div className="topcv-editor-box">
        <div className="topcv-editor-toolbar" role="toolbar" aria-label={`${label} formatting`}>
          <ToolbarButton
            label="Undo"
            disabled={!editor?.can().undo()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            ↶
          </ToolbarButton>
          <ToolbarButton
            label="Redo"
            disabled={!editor?.can().redo()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            ↷
          </ToolbarButton>
          <span className="topcv-toolbar-divider" aria-hidden="true" />
          <ToolbarButton
            label="Bold"
            active={Boolean(editor?.isActive('bold'))}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={Boolean(editor?.isActive('italic'))}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            label="Underline"
            active={Boolean(editor?.isActive('underline'))}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <u>U</u>
          </ToolbarButton>
          <span className="topcv-toolbar-divider" aria-hidden="true" />
          <ToolbarButton
            label="Bullet list"
            active={Boolean(editor?.isActive('bulletList'))}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            ≡
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={Boolean(editor?.isActive('orderedList'))}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            ⁝
          </ToolbarButton>
          <span className="topcv-toolbar-divider" aria-hidden="true" />
          <ToolbarButton
            label="Decrease indent"
            disabled={!editor?.can().liftListItem('listItem')}
            onClick={() => editor?.chain().focus().liftListItem('listItem').run()}
          >
            ⇤
          </ToolbarButton>
          <ToolbarButton
            label="Increase indent"
            disabled={!editor?.can().sinkListItem('listItem')}
            onClick={() => editor?.chain().focus().sinkListItem('listItem').run()}
          >
            ⇥
          </ToolbarButton>
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
