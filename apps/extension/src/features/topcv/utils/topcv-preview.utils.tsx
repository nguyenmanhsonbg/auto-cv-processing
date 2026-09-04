import type { ReactNode } from 'react';

export const TOPCV_DAY_MAP: Record<string | number, string> = {
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7',
  7: 'Chủ Nhật',
};

export function formatTopCvDay(val: string | number): string {
  return TOPCV_DAY_MAP[val] || String(val);
}

export function formatTopCvDate(dateStr: string): string {
  if (!dateStr) return 'Chưa cập nhật';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function renderChildNodes(nodes: ChildNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `node-${index}`;
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    const el = node as HTMLElement;
    const tagName = el.tagName.toUpperCase();
    const children = renderChildNodes(Array.from(el.childNodes));

    switch (tagName) {
      case 'P':
        return <p key={key} className="topcv-preview-paragraph">{children}</p>;
      case 'STRONG':
      case 'B':
        return <strong key={key}>{children}</strong>;
      case 'EM':
      case 'I':
        return <em key={key}>{children}</em>;
      case 'U':
        return <u key={key}>{children}</u>;
      case 'UL':
        return <ul key={key} className="topcv-preview-ul">{children}</ul>;
      case 'OL':
        return <ol key={key} className="topcv-preview-ol">{children}</ol>;
      case 'LI':
        return <li key={key} className="topcv-preview-li">{children}</li>;
      case 'BR':
        return <br key={key} />;
      default:
        return <span key={key}>{children}</span>;
    }
  });
}

export function renderSafeRichText(rawText: string, placeholder: string): ReactNode {
  if (!rawText || !rawText.trim()) {
    return <p className="topcv-preview-paragraph">{placeholder}</p>;
  }

  const isHtml = /<[a-z]/i.test(rawText);
  if (!isHtml) {
    const lines = rawText.split('\n');
    return lines.map((line, idx) => (
      <p key={`line-${idx}`} className="topcv-preview-paragraph">
        {line || '\u00A0'}
      </p>
    ));
  }

  const doc = new DOMParser().parseFromString(rawText, 'text/html');
  return renderChildNodes(Array.from(doc.body.childNodes));
}
