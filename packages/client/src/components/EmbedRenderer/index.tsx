import React from 'react';

interface EmbedBlock {
  ref?: string;
  url?: string;
  title?: string;
  height?: string;
}

// Regex to match [embed ref="..." title="..." height="..." /] or [embed url="..." ... /]
const EMBED_REGEX = /\[embed\s+([^\]]*?)\/\]/g;

function parseAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrString))) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

export function extractEmbeds(content: string): { cleanContent: string; embeds: EmbedBlock[] } {
  const embeds: EmbedBlock[] = [];
  const cleanContent = content.replace(EMBED_REGEX, (_, attrStr) => {
    const attrs = parseAttrs(attrStr);
    embeds.push({
      ref: attrs.ref,
      url: attrs.url,
      title: attrs.title,
      height: attrs.height || '400',
    });
    return ''; // Remove from markdown content
  });
  return { cleanContent: cleanContent.trim(), embeds };
}

export function EmbedRenderer({ embed }: { embed: EmbedBlock }) {
  const src = embed.ref
    ? `/api/canvas/${embed.ref}`
    : embed.url || '';

  if (!src) return null;

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-dark-border">
      {embed.title && (
        <div className="px-3 py-1.5 bg-dark-surface text-xs text-dark-muted border-b border-dark-border">
          {embed.title}
        </div>
      )}
      <iframe
        src={src}
        title={embed.title || 'Embedded content'}
        style={{ width: '100%', height: `${embed.height}px`, border: 'none' }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
