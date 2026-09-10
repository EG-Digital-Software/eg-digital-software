import { format } from 'date-fns';
import type { Task } from '@/types';

/**
 * Export a task's chat thread to a downloadable file — admin-only feature.
 *
 * Both formats are produced with zero extra dependencies:
 *  - Word (.doc): a Word-compatible HTML document served as `application/msword`.
 *    Word (and Google Docs) open it with the formatting intact.
 *  - PDF: the same HTML is opened in a hidden print window and sent to the
 *    browser's native print dialog, where "Save as PDF" produces the file.
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmt = (iso: string) => {
  try {
    return format(new Date(iso), 'dd MMM yyyy, h:mm a');
  } catch {
    return iso;
  }
};

/** Build a self-contained HTML document for the task's chat thread. */
export function buildChatHtml(task: Task, customerName?: string): string {
  const comments = task.comments ?? [];
  const exportedAt = format(new Date(), 'dd MMM yyyy, h:mm a');

  const rows = comments.length
    ? comments
        .map((c) => {
          const files = (c.attachments ?? [])
            .map((f) => `<div class="file">📎 ${esc(f.fileName)}</div>`)
            .join('');
          const body = c.body ? `<div class="body">${esc(c.body).replace(/\n/g, '<br/>')}</div>` : '';
          return `
            <div class="msg">
              <div class="meta"><span class="author">${esc(c.authorName)}</span>
                <span class="role">${esc(c.authorType)}</span>
                <span class="time">${fmt(c.createdAt)}</span></div>
              ${body}
              ${files}
            </div>`;
        })
        .join('')
    : '<p class="empty">No messages in this chat.</p>';

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8"/>
<title>Task Chat — ${esc(task.taskNumber)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; font-size: 12pt; margin: 32px; }
  .head { border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 20px; }
  .brand { color: #4f46e5; font-weight: 700; font-size: 14pt; }
  .title { font-size: 16pt; font-weight: 700; margin: 6px 0 2px; }
  .sub { color: #6b7280; font-size: 10pt; }
  .msg { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; }
  .meta { font-size: 9pt; margin-bottom: 4px; }
  .author { font-weight: 700; color: #4f46e5; }
  .role { color: #9ca3af; margin-left: 6px; text-transform: capitalize; }
  .time { color: #9ca3af; margin-left: 6px; }
  .body { white-space: pre-wrap; }
  .file { color: #374151; font-size: 10pt; margin-top: 4px; }
  .empty { color: #6b7280; font-style: italic; }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">EG Digital</div>
    <div class="title">${esc(task.title)}</div>
    <div class="sub">${esc(task.taskNumber)}${customerName ? ` · ${esc(customerName)}` : ''} · ${comments.length} message${comments.length === 1 ? '' : 's'} · Exported ${exportedAt}</div>
  </div>
  ${rows}
</body>
</html>`;
}

const safeName = (task: Task) => `task-chat-${task.taskNumber}`.replace(/[^a-z0-9-]+/gi, '-');

/** Download the chat as a Word-compatible .doc file. */
export function downloadChatDoc(task: Task, customerName?: string): void {
  const html = buildChatHtml(task, customerName);
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(task)}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Open the chat in a print window so the user can save it as PDF. */
export function printChatPdf(task: Task, customerName?: string): boolean {
  const html = buildChatHtml(task, customerName);
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) return false; // popup blocked
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the window a tick to render before invoking print.
  win.onload = () => {
    win.print();
  };
  // Fallback if onload already fired.
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* ignore */
    }
  }, 400);
  return true;
}
