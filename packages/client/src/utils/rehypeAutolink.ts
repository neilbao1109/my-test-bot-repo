/**
 * rehype plugin that converts bare URLs in text nodes into clickable <a> links.
 * Does NOT use regex lookbehind — safe for iOS 15 / older Safari.
 */
import { visit } from 'unist-util-visit';
import type { Root, Text, Element } from 'hast';

const URL_RE = /\bhttps?:\/\/[^\s<>\])"'`，。！？、；：）】》]+/gi;

export default function rehypeAutolink() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index == null) return;
      // Skip if already inside an <a> tag
      if ((parent as Element).tagName === 'a') return;
      // Skip if inside <code> or <pre>
      if ((parent as Element).tagName === 'code' || (parent as Element).tagName === 'pre') return;

      const value = node.value;
      if (!URL_RE.test(value)) return;
      URL_RE.lastIndex = 0;

      const children: (Text | Element)[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = URL_RE.exec(value)) !== null) {
        // Text before the URL
        if (match.index > lastIndex) {
          children.push({ type: 'text', value: value.slice(lastIndex, match.index) });
        }
        const url = match[0];
        children.push({
          type: 'element',
          tagName: 'a',
          properties: { href: url, target: '_blank', rel: 'noopener noreferrer' },
          children: [{ type: 'text', value: url }],
        });
        lastIndex = match.index + url.length;
      }

      if (children.length === 0) return;

      // Remaining text
      if (lastIndex < value.length) {
        children.push({ type: 'text', value: value.slice(lastIndex) });
      }

      // Replace the text node with the new children
      parent.children.splice(index, 1, ...children);
      return index + children.length; // skip newly inserted nodes
    });
  };
}
