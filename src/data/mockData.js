// Mock data for Codelix IT Solutions CRM

export const mockClients = [
  {
    id: 1, clientName: 'Rajesh Kumar', companyName: 'TechVision Pvt Ltd',
    contact: '9876543210', email: 'rajesh@techvision.com', address: 'Mumbai, Maharashtra',
    createdDate: '2024-01-15', projectType: 'Website', source: 'Referral',
    status: 'Hot', proposalValue: 85000, finalPrice: 75000, priority: 'High',
    createdBy: 'Bhargav Shah', lastContacted: '2024-03-10', nextFollowup: '2024-03-17',
    followupHistory: [
      { date: '2024-03-10', remark: 'Discussed project scope and timeline', nextFollowup: '2024-03-17' },
      { date: '2024-02-28', remark: 'Sent proposal, client reviewing', nextFollowup: '2024-03-10' },
    ]
  },
  {
    id: 2, clientName: 'Priya Mehta', companyName: 'Sparkle Retail',
    contact: '9123456789', email: 'priya@sparkleretail.com', address: 'Ahmedabad, Gujarat',
    createdDate: '2024-02-01', projectType: 'App', source: 'LinkedIn',
    status: 'Warm', proposalValue: 150000, finalPrice: null, priority: 'Medium',
    createdBy: 'Bhargav Shah', lastContacted: '2024-03-08', nextFollowup: '2024-03-15',
    followupHistory: [
      { date: '2024-03-08', remark: 'Follow-up call done, needs time to decide', nextFollowup: '2024-03-15' },
    ]
  },
  {
    id: 3, clientName: 'Amit Patel', companyName: 'Green Earth Solutions',
    contact: '9988776655', email: 'amit@greenearth.in', address: 'Surat, Gujarat',
    createdDate: '2024-01-20', projectType: 'ERP', source: 'Google',
    status: 'Closed Won', proposalValue: 350000, finalPrice: 320000, priority: 'High',
    createdBy: 'Ravi Sharma', lastContacted: '2024-02-20', nextFollowup: null,
    followupHistory: [
      { date: '2024-02-20', remark: 'Deal closed! Starting project next week', nextFollowup: null },
      { date: '2024-02-10', remark: 'Contract review done', nextFollowup: '2024-02-20' },
    ]
  },
  {
    id: 4, clientName: 'Sneha Joshi', companyName: 'Fashion Forward',
    contact: '9777888999', email: 'sneha@fashionforward.com', address: 'Pune, Maharashtra',
    createdDate: '2024-02-10', projectType: 'Design', source: 'Instagram',
    status: 'Cold', proposalValue: 45000, finalPrice: null, priority: 'Low',
    createdBy: 'Bhargav Shah', lastContacted: '2024-02-25', nextFollowup: '2024-03-20',
    followupHistory: [
      { date: '2024-02-25', remark: 'No response, sent follow-up email', nextFollowup: '2024-03-20' },
    ]
  },
  {
    id: 5, clientName: 'Vikram Singh', companyName: 'AutoDrive Motors',
    contact: '9111222333', email: 'vikram@autodrive.co', address: 'Delhi, NCR',
    createdDate: '2024-03-01', projectType: 'Website', source: 'Cold Call',
    status: 'Closed Lost', proposalValue: 60000, finalPrice: null, priority: 'Medium',
    createdBy: 'Ravi Sharma', lastContacted: '2024-03-05', nextFollowup: null,
    followupHistory: [
      { date: '2024-03-05', remark: 'Client went with competitor', nextFollowup: null },
    ]
  },
];

export const mockTransactions = [
  { id: 1, type: 'Credit', accountType: 'Bank', amount: 75000, date: '2024-03-10 11:30', source: 'Client Payment', category: null, clientName: 'Amit Patel', paidTo: null, paymentMethod: 'Bank Transfer', remark: 'Advance payment for ERP project' },
  { id: 2, type: 'Debit', accountType: 'Cash', amount: 15000, date: '2024-03-08 10:00', source: null, category: 'Employee Salary', clientName: null, paidTo: 'Ravi Sharma', paymentMethod: 'Cash', remark: 'March salary partial' },
  { id: 3, type: 'Credit', accountType: 'Bank', amount: 32000, date: '2024-03-05 14:15', source: 'Client Payment', category: null, clientName: 'Rajesh Kumar', paidTo: null, paymentMethod: 'UPI', remark: '50% advance for website' },
  { id: 4, type: 'Debit', accountType: 'Bank', amount: 8500, date: '2024-03-01 09:00', source: null, category: 'Rent', clientName: null, paidTo: 'Office Landlord', paymentMethod: 'Bank Transfer', remark: 'March office rent' },
  { id: 5, type: 'Debit', accountType: 'Cash', amount: 2400, date: '2024-02-28 18:00', source: null, category: 'Electricity', clientName: null, paidTo: 'DGVCL', paymentMethod: 'Cash', remark: 'Feb electricity bill' },
  { id: 6, type: 'Credit', accountType: 'Cash', amount: 5000, date: '2024-02-25 12:00', source: 'Other Income', category: null, clientName: null, paidTo: null, paymentMethod: 'Cash', remark: 'Miscellaneous income' },
  { id: 7, type: 'Debit', accountType: 'Bank', amount: 12000, date: '2024-02-20 11:00', source: null, category: 'Tools', clientName: null, paidTo: 'Adobe Inc.', paymentMethod: 'Card', remark: 'Annual Adobe CC subscription' },
  { id: 8, type: 'Credit', accountType: 'Bank', amount: 48000, date: '2024-02-15 15:30', source: 'Advance', category: null, clientName: 'Priya Mehta', paidTo: null, paymentMethod: 'Bank Transfer', remark: 'App project advance' },
];

export const openingBalances = { cash: 25000, bank: 150000 };

export const mockEmployees = [
  { id: 1, empId: 'CLX001', name: 'Ravi Sharma', mobile: '9876501234', email: 'ravi@codelix.in', address: 'Surat, Gujarat', photo: null, role: 'Full Stack Developer', department: 'Tech', joiningDate: '2023-06-01', employmentType: 'Full-time', status: 'Active', salaryType: 'Monthly', salaryAmount: 35000, paymentCycle: 'Monthly', upiId: 'ravi@paytm', salaryHistory: [
    { month: 'March 2024', paid: 35000, date: '2024-03-31', method: 'Bank Transfer', remark: 'Full salary' },
    { month: 'February 2024', paid: 35000, date: '2024-02-29', method: 'Bank Transfer', remark: '' },
  ]},
  { id: 2, empId: 'CLX002', name: 'Anjali Patel', mobile: '9123498765', email: 'anjali@codelix.in', address: 'Ahmedabad, Gujarat', photo: null, role: 'UI/UX Designer', department: 'Design', joiningDate: '2023-09-15', employmentType: 'Full-time', status: 'Active', salaryType: 'Monthly', salaryAmount: 28000, paymentCycle: 'Monthly', upiId: 'anjali@gpay', salaryHistory: [
    { month: 'March 2024', paid: 28000, date: '2024-03-31', method: 'UPI', remark: '' },
  ]},
  { id: 3, empId: 'CLX003', name: 'Meet Trivedi', mobile: '9988123456', email: 'meet@codelix.in', address: 'Vadodara, Gujarat', photo: null, role: 'Sales Executive', department: 'Sales', joiningDate: '2024-01-10', employmentType: 'Full-time', status: 'Active', salaryType: 'Monthly', salaryAmount: 22000, paymentCycle: 'Monthly', upiId: null, salaryHistory: [
    { month: 'March 2024', paid: 0, date: null, method: null, remark: 'Pending' },
    { month: 'February 2024', paid: 22000, date: '2024-02-29', method: 'Cash', remark: '' },
  ]},
  { id: 4, empId: 'CLX004', name: 'Sara Kapoor', mobile: '9777001122', email: 'sara@freelance.com', address: 'Remote', photo: null, role: 'Content Writer', department: 'Ops', joiningDate: '2024-02-01', employmentType: 'Freelancer', status: 'Active', salaryType: 'Per Project', salaryAmount: 5000, paymentCycle: 'Custom', upiId: 'sara@phonepe', salaryHistory: [] },
];

export const mockProjects = [
  { id: 1, projectName: 'TechVision Corporate Website', clientName: 'Rajesh Kumar', companyName: 'TechVision Pvt Ltd', projectType: 'Website', handledBy: 'Ravi Sharma', startDate: '2024-03-15', dueDate: '2024-04-30', status: 'In Progress', valuation: 75000, milestones: [{ label: '30% Advance', percent: 30 }, { label: '40% Midway', percent: 40 }, { label: '30% Completion', percent: 30 }], payments: [{ amount: 22500, date: '2024-03-15 10:00', method: 'Bank Transfer', remark: '30% advance received' }], nextPaymentDue: '2024-04-10' },
  { id: 2, projectName: 'Sparkle Retail Mobile App', clientName: 'Priya Mehta', companyName: 'Sparkle Retail', projectType: 'App', handledBy: 'Anjali Patel', startDate: '2024-02-20', dueDate: '2024-05-20', status: 'In Progress', valuation: 150000, milestones: [{ label: '40% Advance', percent: 40 }, { label: '30% Beta', percent: 30 }, { label: '30% Final', percent: 30 }], payments: [{ amount: 60000, date: '2024-02-20 14:00', method: 'Bank Transfer', remark: 'Advance payment' }, { amount: 45000, date: '2024-03-20 11:00', method: 'UPI', remark: 'Beta milestone' }], nextPaymentDue: '2024-05-15' },
  { id: 3, projectName: 'Green Earth ERP System', clientName: 'Amit Patel', companyName: 'Green Earth Solutions', projectType: 'ERP', handledBy: 'Ravi Sharma', startDate: '2024-02-28', dueDate: '2024-07-31', status: 'In Progress', valuation: 320000, milestones: [{ label: '30% Advance', percent: 30 }, { label: '40% Development', percent: 40 }, { label: '30% Delivery', percent: 30 }], payments: [{ amount: 96000, date: '2024-02-28 09:00', method: 'Bank Transfer', remark: 'Project kickoff advance' }], nextPaymentDue: '2024-05-01' },
  { id: 4, projectName: 'Fashion Forward Branding', clientName: 'Sneha Joshi', companyName: 'Fashion Forward', projectType: 'Design', handledBy: 'Anjali Patel', startDate: '2024-01-05', dueDate: '2024-02-28', status: 'Completed', valuation: 45000, milestones: [{ label: '50% Advance', percent: 50 }, { label: '50% Final', percent: 50 }], payments: [{ amount: 22500, date: '2024-01-05 10:00', method: 'UPI', remark: 'Advance' }, { amount: 22500, date: '2024-02-27 15:00', method: 'Cash', remark: 'Final payment' }], nextPaymentDue: null },
];

export const mockCredentials = [
  { id: 1, clientName: 'Rajesh Kumar', projectName: 'TechVision Corporate Website', type: 'Hosting', platform: 'cPanel', url: 'https://techvision.com/cpanel', username: 'techvision_admin', password: '••••••••••', notes: 'GoDaddy hosting, renews Jan 2025' },
  { id: 2, clientName: 'Amit Patel', projectName: 'Green Earth ERP System', type: 'Database', platform: 'MySQL', url: null, username: 'greenearth_db', password: '••••••••••', notes: 'Production DB credentials' },
  { id: 3, clientName: 'Priya Mehta', projectName: 'Sparkle Retail Mobile App', type: 'App Store', platform: 'Google Play Console', url: 'https://play.google.com/console', username: 'sparkle.dev@gmail.com', password: '••••••••••', notes: 'Dev account' },
  { id: 4, clientName: 'Internal', projectName: 'Codelix Tools', type: 'Tool', platform: 'Figma', url: 'https://figma.com', username: 'design@codelix.in', password: '••••••••••', notes: 'Team design account' },
];

export const PROJECT_TYPES = ['Website Development', 'Mobile App', 'ERP / CRM', 'UI/UX Design', 'Branding & Design', 'Digital Marketing'];
export const SOURCES = ['Referral', 'LinkedIn', 'Google', 'Instagram', 'Facebook', 'Cold Call', 'Walk-in', 'Other'];
export const CLIENT_STATUSES = ['Cold', 'Warm', 'Hot', 'Closed Won', 'Closed Lost', 'Not Received'];
export const PARTNERS = ['Bhargav Thesiya', 'Manas Vadodaria', 'Kushal Mungalpara', 'Prince Padariya'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const DEPARTMENTS = ['Tech', 'Design', 'Sales', 'Ops'];
export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Freelancer', 'Intern'];
export const SALARY_TYPES = ['Monthly', 'Per Project', 'Hourly', 'Free'];
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card'];
export const PROJECT_STATUSES = ['Pending', 'In Progress', 'Completed', 'On Hold', 'Cancelled'];
export const TRANSACTION_SOURCES = ['Client Payment', 'Advance', 'Other Income'];
export const EXPENSE_CATEGORIES = ['Office Rent', 'Electrical Bill', 'Tools', 'Office Expense', 'Other'];
