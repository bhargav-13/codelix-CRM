import { supabase } from './supabase';

// ─────────────────────────────────────────────
// CLIENTS
// ─────────────────────────────────────────────
const toClient = r => ({
  id:               r.id,
  clientName:       r.client_name,
  companyName:      r.company_name,
  contact:          r.contact,
  email:            r.email,
  address:          r.address,
  createdDate:      r.created_date,
  projectType:      r.project_type,
  source:           r.source,
  status:           r.status,
  proposalValue:    r.proposal_value,
  finalPrice:       r.final_price,
  priority:         r.priority,
  createdBy:        r.created_by,
  lastContacted:    r.last_contacted,
  nextFollowup:     r.next_followup,
  followupHistory:  r.followup_history || [],
});

const fromClient = c => ({
  client_name:      c.clientName,
  company_name:     c.companyName,
  contact:          c.contact       || null,
  email:            c.email         || null,
  address:          c.address       || null,
  created_date:     c.createdDate   || new Date().toISOString().split('T')[0],
  project_type:     c.projectType,
  source:           c.source,
  status:           c.status,
  proposal_value:   c.proposalValue ? +c.proposalValue : null,
  final_price:      c.finalPrice    ? +c.finalPrice    : null,
  priority:         c.priority,
  created_by:       c.createdBy     || null,
  last_contacted:   c.lastContacted || null,
  next_followup:    c.nextFollowup  || null,
  followup_history: c.followupHistory || [],
});

export const clientsDB = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('clients').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toClient);
  },
  create: async (c) => {
    const { data, error } = await supabase
      .from('clients').insert(fromClient(c)).select().single();
    if (error) throw error;
    return toClient(data);
  },
  update: async (id, c) => {
    const { data, error } = await supabase
      .from('clients').update(fromClient(c)).eq('id', id).select().single();
    if (error) throw error;
    return toClient(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) throw error;
  },
  updateFollowup: async (id, followupHistory, lastContacted, nextFollowup) => {
    const { data, error } = await supabase
      .from('clients')
      .update({ followup_history: followupHistory, last_contacted: lastContacted, next_followup: nextFollowup || null })
      .eq('id', id).select().single();
    if (error) throw error;
    return toClient(data);
  },
  updateStatus: async (id, status) => {
    const { error } = await supabase.from('clients').update({ status }).eq('id', id);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────
const toTx = r => ({
  id:            r.id,
  type:          r.type,
  accountType:   r.account_type,
  amount:        r.amount,
  date:          r.date,
  source:        r.source,
  category:      r.category,
  clientName:    r.client_name,
  paidTo:        r.paid_to,
  paymentMethod: r.payment_method,
  remark:        r.remark,
  subType:       r.sub_type,
  person:        r.person,
  monthLabel:    r.month_label,
});

const fromTx = t => ({
  type:           t.type,
  account_type:   t.accountType,
  amount:         +t.amount,
  date:           t.date,
  source:         t.source        || null,
  category:       t.category      || null,
  client_name:    t.clientName    || null,
  paid_to:        t.paidTo        || null,
  payment_method: t.paymentMethod || null,
  remark:         t.remark        || null,
  sub_type:       t.subType       || null,
  person:         t.person        || null,
  month_label:    t.monthLabel    || null,
});

export const transactionsDB = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('transactions').select('*').order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map(toTx);
  },
  create: async (t) => {
    const { data, error } = await supabase
      .from('transactions').insert(fromTx(t)).select().single();
    if (error) throw error;
    return toTx(data);
  },
  update: async (id, t) => {
    const { data, error } = await supabase
      .from('transactions').update(fromTx(t)).eq('id', id).select().single();
    if (error) throw error;
    return toTx(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
// SETTINGS (opening balances, etc.)
// ─────────────────────────────────────────────
export const settingsDB = {
  get: async (key) => {
    const { data } = await supabase.from('settings').select('value').eq('key', key).single();
    return data?.value || null;
  },
  set: async (key, value) => {
    const { error } = await supabase
      .from('settings').upsert({ key, value }, { onConflict: 'key' });
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
// EMPLOYEES
// ─────────────────────────────────────────────
const toEmp = r => ({
  id:             r.id,
  empId:          r.emp_id,
  name:           r.name,
  mobile:         r.mobile,
  email:          r.email,
  address:        r.address,
  role:           r.role,
  department:     r.department,
  joiningDate:    r.joining_date,
  employmentType: r.employment_type,
  status:         r.status,
  salaryType:     r.salary_type,
  salaryAmount:   r.salary_amount,
  paymentCycle:   r.payment_cycle,
  upiId:          r.upi_id,
  bankDetails:    r.bank_details,
  salaryHistory:  r.salary_history || [],
});

const fromEmp = e => ({
  emp_id:          e.empId          || null,
  name:            e.name,
  mobile:          e.mobile         || null,
  email:           e.email          || null,
  address:         e.address        || null,
  role:            e.role           || null,
  department:      e.department,
  joining_date:    e.joiningDate    || null,
  employment_type: e.employmentType,
  status:          e.status,
  salary_type:     e.salaryType,
  salary_amount:   e.salaryAmount ? +e.salaryAmount : null,
  payment_cycle:   e.paymentCycle  || null,
  upi_id:          e.upiId         || null,
  bank_details:    e.bankDetails   || null,
  salary_history:  e.salaryHistory || [],
});

export const employeesDB = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('employees').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toEmp);
  },
  create: async (e) => {
    const { data, error } = await supabase
      .from('employees').insert(fromEmp(e)).select().single();
    if (error) throw error;
    return toEmp(data);
  },
  update: async (id, e) => {
    const { data, error } = await supabase
      .from('employees').update(fromEmp(e)).eq('id', id).select().single();
    if (error) throw error;
    return toEmp(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) throw error;
  },
  addSalary: async (id, salaryHistory) => {
    const { data, error } = await supabase
      .from('employees').update({ salary_history: salaryHistory }).eq('id', id).select().single();
    if (error) throw error;
    return toEmp(data);
  },
  count: async () => {
    const { count } = await supabase.from('employees').select('*', { count: 'exact', head: true });
    return count || 0;
  },
};

// ─────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────
const toProj = r => ({
  id:                 r.id,
  projectName:        r.project_name,
  clientName:         r.client_name,
  companyName:        r.company_name,
  projectType:        r.project_type,
  handledBy:          r.handled_by,
  startDate:          r.start_date,
  dueDate:            r.due_date,
  status:             r.status,
  valuation:          r.valuation,
  billingType:        r.billing_type        || 'Without GST',
  milestones:         r.milestones          || [],
  payments:           r.payments            || [],
  nextPaymentDue:     r.next_payment_due,
  assignedEmployees:  r.assigned_employees  || [],
});

const fromProj = p => ({
  project_name:        p.projectName,
  client_name:         p.clientName         || null,
  company_name:        p.companyName        || null,
  project_type:        p.projectType,
  handled_by:          p.handledBy          || null,
  start_date:          p.startDate          || null,
  due_date:            p.dueDate            || null,
  status:              p.status,
  valuation:           p.valuation ? +p.valuation : null,
  billing_type:        p.billingType        || 'Without GST',
  milestones:          p.milestones         || [],
  payments:            p.payments           || [],
  next_payment_due:    p.nextPaymentDue     || null,
  assigned_employees:  p.assignedEmployees  || [],
});

export const projectsDB = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('projects').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toProj);
  },
  create: async (p) => {
    const { data, error } = await supabase
      .from('projects').insert(fromProj(p)).select().single();
    if (error) throw error;
    return toProj(data);
  },
  update: async (id, p) => {
    const { data, error } = await supabase
      .from('projects').update(fromProj(p)).eq('id', id).select().single();
    if (error) throw error;
    return toProj(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  },
  addPayment: async (id, payments) => {
    const { data, error } = await supabase
      .from('projects').update({ payments }).eq('id', id).select().single();
    if (error) throw error;
    return toProj(data);
  },
};

// ─────────────────────────────────────────────
// PARTNER SALARIES
// ─────────────────────────────────────────────
const toSalRec = r => ({
  id:            r.id,
  partner:       r.partner,
  month:         r.month,
  amount:        r.amount,
  paidDate:      r.paid_date,
  paymentMethod: r.payment_method,
  notes:         r.notes,
  createdAt:     r.created_at,
});

const fromSalRec = s => ({
  partner:        s.partner,
  month:          s.month,
  amount:         +s.amount,
  paid_date:      s.paidDate      || null,
  payment_method: s.paymentMethod || null,
  notes:          s.notes         || null,
});

export const partnerSalariesDB = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('partner_salaries').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toSalRec);
  },
  create: async (s) => {
    const { data, error } = await supabase
      .from('partner_salaries').insert(fromSalRec(s)).select().single();
    if (error) throw error;
    return toSalRec(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from('partner_salaries').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
// PARTNER DRAWINGS
// ─────────────────────────────────────────────
const toDrawing = r => ({
  id:          r.id,
  partner:     r.partner,
  amountTaken: r.amount_taken,
  dateTaken:   r.date_taken,
  purpose:     r.purpose,
  returns:     r.returns || [],
  notes:       r.notes,
  createdAt:   r.created_at,
});

const fromDrawing = d => ({
  partner:      d.partner,
  amount_taken: +d.amountTaken,
  date_taken:   d.dateTaken,
  purpose:      d.purpose  || null,
  returns:      d.returns  || [],
  notes:        d.notes    || null,
});

export const drawingsDB = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('partner_drawings').select('*').order('date_taken', { ascending: false });
    if (error) throw error;
    return (data || []).map(toDrawing);
  },
  create: async (d) => {
    const { data, error } = await supabase
      .from('partner_drawings').insert(fromDrawing(d)).select().single();
    if (error) throw error;
    return toDrawing(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from('partner_drawings').delete().eq('id', id);
    if (error) throw error;
  },
  addReturn: async (id, returns) => {
    const { data, error } = await supabase
      .from('partner_drawings').update({ returns }).eq('id', id).select().single();
    if (error) throw error;
    return toDrawing(data);
  },
};

// ─────────────────────────────────────────────
// CREDENTIALS
// ─────────────────────────────────────────────
const toCred = r => ({
  id:          r.id,
  clientName:  r.client_name,
  projectName: r.project_name,
  type:        r.type,
  platform:    r.platform,
  url:         r.url,
  username:    r.username,
  password:    r.password,
  notes:       r.notes,
});

const fromCred = c => ({
  client_name:  c.clientName  || null,
  project_name: c.projectName || null,
  type:         c.type,
  platform:     c.platform,
  url:          c.url         || null,
  username:     c.username,
  password:     c.password,
  notes:        c.notes       || null,
});

export const credentialsDB = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('credentials').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toCred);
  },
  create: async (c) => {
    const { data, error } = await supabase
      .from('credentials').insert(fromCred(c)).select().single();
    if (error) throw error;
    return toCred(data);
  },
  update: async (id, c) => {
    const { data, error } = await supabase
      .from('credentials').update(fromCred(c)).eq('id', id).select().single();
    if (error) throw error;
    return toCred(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from('credentials').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
// PROJECT UPDATES
// ─────────────────────────────────────────────
const toUpdate = r => ({
  id:          r.id,
  projectName: r.project_name,
  title:       r.title,
  content:     r.content,
  status:      r.status,
  updateType:  r.update_type,
  createdBy:   r.created_by,
  attachments: r.attachments || [],
  createdAt:   r.created_at,
});

const fromUpdate = u => ({
  project_name: u.projectName || null,
  title:        u.title,
  content:      u.content     || null,
  status:       u.status      || 'In Progress',
  update_type:  u.updateType  || 'Update',
  created_by:   u.createdBy   || null,
  attachments:  u.attachments || [],
});

export const projectUpdatesDB = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('project_updates').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toUpdate);
  },
  create: async (u) => {
    const { data, error } = await supabase
      .from('project_updates').insert(fromUpdate(u)).select().single();
    if (error) throw error;
    return toUpdate(data);
  },
  update: async (id, u) => {
    const { data, error } = await supabase
      .from('project_updates').update(fromUpdate(u)).eq('id', id).select().single();
    if (error) throw error;
    return toUpdate(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from('project_updates').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
// EXISTING PROJECTS
// ─────────────────────────────────────────────
const toExistingProj = r => ({
  id:              r.id,
  projectName:     r.project_name,
  clientName:      r.client_name,
  companyName:     r.company_name,
  projectType:     r.project_type,
  finalValue:      r.final_value,
  billingType:     r.billing_type || 'Without GST',
  description:     r.description,
  techStack:       r.tech_stack,
  projectUrl:      r.project_url,
  status:          r.status,
  notes:           r.notes,
  contactPerson:   r.contact_person,
  phone:           r.phone,
  email:           r.email,
  whatsapp:        r.whatsapp,
  city:            r.city,
});

const fromExistingProj = p => ({
  project_name:   p.projectName,
  client_name:    p.clientName    || null,
  company_name:   p.companyName   || null,
  project_type:   p.projectType   || null,
  final_value:    p.finalValue    ? +p.finalValue : null,
  billing_type:   p.billingType   || 'Without GST',
  description:    p.description   || null,
  tech_stack:     p.techStack     || null,
  project_url:    p.projectUrl    || null,
  status:         p.status        || 'Delivered',
  notes:          p.notes         || null,
  contact_person: p.contactPerson || null,
  phone:          p.phone         || null,
  email:          p.email         || null,
  whatsapp:       p.whatsapp      || null,
  city:           p.city          || null,
});

export const existingProjectsDB = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('existing_projects').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toExistingProj);
  },
  create: async (p) => {
    const { data, error } = await supabase
      .from('existing_projects').insert(fromExistingProj(p)).select().single();
    if (error) throw error;
    return toExistingProj(data);
  },
  update: async (id, p) => {
    const { data, error } = await supabase
      .from('existing_projects').update(fromExistingProj(p)).eq('id', id).select().single();
    if (error) throw error;
    return toExistingProj(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from('existing_projects').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
// TASKS / TODO  (Kanban board)
// ─────────────────────────────────────────────
const toTask = r => ({
  id:          r.id,
  taskNo:      r.task_no,
  title:       r.title,
  description: r.description,
  type:        r.type,
  status:      r.status,
  priority:    r.priority,
  assignees:   r.assignees   || [],
  reporter:    r.reporter,
  dueDate:     r.due_date,
  labels:      r.labels      || [],
  projectName: r.project_name,
  comments:    r.comments    || [],
  attachments: r.attachments || [],
  sortOrder:   r.sort_order,
  createdAt:   r.created_at,
});

const fromTask = t => ({
  task_no:      t.taskNo ?? null,
  title:        t.title,
  description:  t.description || null,
  type:         t.type        || 'Task',
  status:       t.status      || 'Backlog',
  priority:     t.priority    || 'Medium',
  assignees:    t.assignees   || [],
  reporter:     t.reporter    || null,
  due_date:     t.dueDate     || null,
  labels:       t.labels      || [],
  project_name: t.projectName || null,
  comments:     t.comments    || [],
  attachments:  t.attachments || [],
  sort_order:   t.sortOrder ?? 0,
});

export const tasksDB = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('tasks').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(toTask);
  },
  create: async (t) => {
    const { data, error } = await supabase
      .from('tasks').insert(fromTask(t)).select().single();
    if (error) throw error;
    return toTask(data);
  },
  update: async (id, t) => {
    const { data, error } = await supabase
      .from('tasks').update(fromTask(t)).eq('id', id).select().single();
    if (error) throw error;
    return toTask(data);
  },
  // Lightweight patch used by drag-and-drop (status + ordering only)
  move: async (id, status, sortOrder) => {
    const { data, error } = await supabase
      .from('tasks').update({ status, sort_order: sortOrder }).eq('id', id).select().single();
    if (error) throw error;
    return toTask(data);
  },
  patch: async (id, patch) => {
    const { data, error } = await supabase
      .from('tasks').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return toTask(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
// CHAT (DMs + Groups)
// ─────────────────────────────────────────────
const toChannel = r => ({
  id:                 r.id,
  name:               r.name,
  type:               r.type || 'group',
  members:            r.members || [],
  createdBy:          r.created_by,
  lastMessageAt:      r.last_message_at,
  lastMessagePreview: r.last_message_preview,
  createdAt:          r.created_at,
});

const toMessage = r => ({
  id:          r.id,
  channelId:   r.channel_id,
  senderId:    r.sender_id,
  senderName:  r.sender_name,
  senderKind:  r.sender_kind,
  text:        r.text,
  attachments: r.attachments || [],
  createdAt:   r.created_at,
});

export const chatDB = {
  getChannels: async () => {
    const { data, error } = await supabase
      .from('chat_channels').select('*').order('last_message_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data || []).map(toChannel);
  },
  createChannel: async ({ name, type, members, createdBy }) => {
    const { data, error } = await supabase
      .from('chat_channels').insert({ name: name || null, type, members: members || [], created_by: createdBy || null }).select().single();
    if (error) throw error;
    return toChannel(data);
  },
  updateMembers: async (id, members) => {
    const { data, error } = await supabase
      .from('chat_channels').update({ members }).eq('id', id).select().single();
    if (error) throw error;
    return toChannel(data);
  },
  deleteChannel: async (id) => {
    const { error } = await supabase.from('chat_channels').delete().eq('id', id);
    if (error) throw error;
  },
  getMessages: async (channelId) => {
    const { data, error } = await supabase
      .from('chat_messages').select('*').eq('channel_id', channelId).order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(toMessage);
  },
  sendMessage: async ({ channelId, senderId, senderName, senderKind, text, attachments }) => {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ channel_id: channelId, sender_id: senderId, sender_name: senderName, sender_kind: senderKind, text: text || null, attachments: attachments || [] })
      .select().single();
    if (error) throw error;
    const preview = text?.trim() ? text.trim().slice(0, 80) : (attachments?.length ? `📎 ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}` : '');
    await supabase.from('chat_channels').update({ last_message_at: data.created_at, last_message_preview: preview }).eq('id', channelId);
    return toMessage(data);
  },
  deleteMessage: async (id) => {
    const { error } = await supabase.from('chat_messages').delete().eq('id', id);
    if (error) throw error;
  },
  // One subscription for every incoming message across all of the user's
  // channels — callers filter by channel_id themselves (membership can
  // change, and per-channel subscriptions would need constant re-wiring).
  subscribeToAll: (onInsert) => {
    const sub = supabase
      .channel('chat_messages_all')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        payload => onInsert(toMessage(payload.new)))
      .subscribe();
    return () => supabase.removeChannel(sub);
  },
};

// ─────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────
const toAudit = r => ({
  id:          r.id,
  entity:      r.entity,
  entityId:    r.entity_id,
  action:      r.action,
  description: r.description,
  by:          r.by,
  prevData:    r.prev_data,
  nextData:    r.next_data,
  createdAt:   r.created_at,
});

export const auditDB = {
  getAll: async (entity) => {
    let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false });
    if (entity) q = q.eq('entity', entity);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(toAudit);
  },
  log: async ({ entity, entityId, action, description, by, prevData, nextData }) => {
    const { error } = await supabase.from('audit_log').insert({
      entity,
      entity_id:   entityId   || null,
      action,
      description: description || null,
      by:          by          || null,
      prev_data:   prevData    || null,
      next_data:   nextData    || null,
    });
    if (error) console.error('Audit log error:', error);
  },
};

// ─────────────────────────────────────────────
// FILE UPLOAD  (Supabase Storage — bucket: project-updates)
// ─────────────────────────────────────────────
export async function uploadProjectFile(file) {
  const ext      = file.name.split('.').pop().toLowerCase();
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from('project-updates')
    .upload(safeName, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage
    .from('project-updates').getPublicUrl(safeName);
  return { name: file.name, url: publicUrl, type: file.type, size: file.size, path: safeName };
}
