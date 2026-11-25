// Letter templates — listed so the team knows what is planned; none can be generated yet.
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import { DOC_TYPES } from '../lib/documents';
import { FileText, FileSignature, HandHeart, ShieldCheck, Heart, CalendarRange, Info } from 'lucide-react';
import './Documents.css';

const ICONS = { proposal: FileText, sow: FileSignature, welcome: HandHeart, nda: ShieldCheck, thank_you: Heart, milestones: CalendarRange };

export default function Templates() {
  return (
    <div>
      <Header title="Templates" subtitle={`${DOC_TYPES.length} letter templates · coming soon`} />
      <div className="page-body">
        <div className="doc-note">
          <Info size={15} aria-hidden="true" />
          <span>Templates are on the way. You will pick a client, and the letter will be filled in with their details, ready to send. Until then, upload finished letters under <strong>Client documents</strong>.</span>
        </div>
        <div className="tpl-grid">
          {DOC_TYPES.map(t => {
            const Icon = ICONS[t.id] || FileText;
            return (
              <div key={t.id} className="mac-card tpl-card" aria-disabled="true">
                <span className="tpl-icon"><Icon size={20} aria-hidden="true" /></span>
                <span className="tpl-body">
                  <span className="tpl-name">{t.label}</span>
                  <span className="tpl-text">{t.text}</span>
                </span>
                <Badge color="purple">Coming soon</Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
