// ================================================================
// Codelix CRM — send-task-email Edge Function
//
// Called by the `trg_notify_task_email` Postgres trigger (see
// supabase/notifications.sql) whenever a task is inserted or updated.
// Emails every assignee (and the reporter, on updates) via SMTP.
//
// Deploy:
//   supabase functions deploy send-task-email
//
// Secrets (set once):
//   supabase secrets set SMTP_HOST=smtp.gmail.com SMTP_PORT=587 \
//     SMTP_EMAIL=you@example.com SMTP_PASSWORD=xxxx SUPABASE_URL=... \
//     SUPABASE_SERVICE_ROLE_KEY=...
// ================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SMTP_HOST     = Deno.env.get('SMTP_HOST')     ?? 'smtp.gmail.com';
const SMTP_PORT     = Number(Deno.env.get('SMTP_PORT') ?? '587');
const SMTP_EMAIL    = Deno.env.get('SMTP_EMAIL')    ?? '';
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD') ?? '';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function taskEmailHtml(task: any, event: string) {
  const statusLine = event === 'INSERT' ? 'A new task was created' : 'A task was updated';
  return `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#1D1D1F;font-size:18px">${statusLine}</h2>
      <p style="color:#3C3C43;font-size:14px"><b>${task.title}</b></p>
      <table style="font-size:13px;color:#3C3C43;border-collapse:collapse">
        <tr><td style="padding:4px 10px 4px 0;color:#8E8E93">Status</td><td>${task.status}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#8E8E93">Priority</td><td>${task.priority}</td></tr>
        ${task.due_date ? `<tr><td style="padding:4px 10px 4px 0;color:#8E8E93">Due</td><td>${task.due_date}</td></tr>` : ''}
        ${task.project_name ? `<tr><td style="padding:4px 10px 4px 0;color:#8E8E93">Project</td><td>${task.project_name}</td></tr>` : ''}
      </table>
      <p style="color:#8E8E93;font-size:11.5px;margin-top:18px">Codelix CRM · Tasks / Todo</p>
    </div>`;
}

serve(async (req) => {
  try {
    if (!SMTP_EMAIL || !SMTP_PASSWORD) {
      return new Response(JSON.stringify({ skipped: true, reason: 'SMTP not configured' }), { status: 200 });
    }

    const { type: event, task } = await req.json();
    if (!task) return new Response(JSON.stringify({ skipped: true }), { status: 200 });

    const assignees: Array<{ id: string; name: string; kind: string }> = task.assignees || [];
    if (assignees.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'No assignees' }), { status: 200 });
    }

    // Resolve recipient emails: employees from `employees` table.
    const employeeIds = assignees.filter(a => a.kind === 'employee').map(a => a.id);
    let employeeEmails: string[] = [];
    if (employeeIds.length > 0) {
      const { data } = await supabase.from('employees').select('id,email').in('id', employeeIds);
      employeeEmails = (data || []).map(e => e.email).filter(Boolean);
    }

    if (employeeEmails.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'No employee emails resolved' }), { status: 200 });
    }

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: SMTP_PORT === 465,
        auth: { username: SMTP_EMAIL, password: SMTP_PASSWORD },
      },
    });

    const subject = event === 'INSERT'
      ? `New task assigned: ${task.title}`
      : `Task updated: ${task.title}`;

    for (const to of employeeEmails) {
      await client.send({
        from: SMTP_EMAIL,
        to,
        subject,
        html: taskEmailHtml(task, event),
      });
    }
    await client.close();

    return new Response(JSON.stringify({ sent: employeeEmails.length }), { status: 200 });
  } catch (err) {
    console.error('send-task-email error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
