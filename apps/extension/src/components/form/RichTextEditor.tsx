import { useEffect, useId, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  BulletListIcon,
  NumberedListIcon,
  RedoIcon,
  UndoIcon,
} from '@/assets/icons';

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
        class: 'rich-text-editor-content',
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
    <div className="rich-text-editor">
      <label className="rich-text-editor-label" htmlFor={editorId}>
        {label} {required ? <span className="req" aria-hidden="true">*</span> : null}
      </label>
      <div className="rich-text-editor-box">
        <div className="rich-text-editor-toolbar" role="toolbar" aria-label={`${label} formatting`}>
          <ToolbarButton
            label="Hoàn tác"
            disabled={!editor?.can().undo()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <UndoIcon />
          </ToolbarButton>
          <ToolbarButton
            label="Làm lại"
            disabled={!editor?.can().redo()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <RedoIcon />
          </ToolbarButton>
          <span className="rich-text-editor-divider" aria-hidden="true" />
          <ToolbarButton
            label="In đậm"
            active={Boolean(editor?.isActive('bold'))}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <span className="rich-text-editor-text-bold">B</span>
          </ToolbarButton>
          <ToolbarButton
            label="In nghiêng"
            active={Boolean(editor?.isActive('italic'))}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <span className="rich-text-editor-text-italic">I</span>
          </ToolbarButton>
          <ToolbarButton
            label="Gạch chân"
            active={Boolean(editor?.isActive('underline'))}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <span className="rich-text-editor-text-underline">U</span>
          </ToolbarButton>
          <span className="rich-text-editor-divider" aria-hidden="true" />
          <ToolbarButton
            label="Danh sách dấu đầu dòng"
            active={Boolean(editor?.isActive('bulletList'))}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <BulletListIcon />
          </ToolbarButton>
          <ToolbarButton
            label="Danh sách đánh số"
            active={Boolean(editor?.isActive('orderedList'))}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <NumberedListIcon />
          </ToolbarButton>
          <span className="rich-text-editor-divider" aria-hidden="true" />
          <ToolbarButton
            label="Giảm lề"
            disabled={!editor?.can().liftListItem('listItem')}
            onClick={() => editor?.chain().focus().liftListItem('listItem').run()}
          >
            ⇤
          </ToolbarButton>
          <ToolbarButton
            label="Tăng lề"
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
