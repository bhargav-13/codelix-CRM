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
});

const fromTx = t => ({
  type:           t.type,
  account_type:   t.accountType,
  amount:         +t.amount,
  date:           t.date,
  source:         t.source   || null,
  category:       t.category || null,
  client_name:    t.clientName    || null,
  paid_to:        t.paidTo        || null,
  payment_method: t.paymentMethod || null,
  remark:         t.remark        || null,
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
  id:              r.id,
  projectName:     r.project_name,
  clientName:      r.client_name,
  companyName:     r.company_name,
  projectType:     r.project_type,
  handledBy:       r.handled_by,
  startDate:       r.start_date,
  dueDate:         r.due_date,
  status:          r.status,
  valuation:       r.valuation,
  milestones:      r.milestones  || [],
  payments:        r.payments    || [],
  nextPaymentDue:  r.next_payment_due,
});

const fromProj = p => ({
  project_name:     p.projectName,
  client_name:      p.clientName      || null,
  company_name:     p.companyName     || null,
  project_type:     p.projectType,
  handled_by:       p.handledBy       || null,
  start_date:       p.startDate       || null,
  due_date:         p.dueDate         || null,
  status:           p.status,
  valuation:        p.valuation ? +p.valuation : null,
  milestones:       p.milestones      || [],
  payments:         p.payments        || [],
  next_payment_due: p.nextPaymentDue  || null,
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
