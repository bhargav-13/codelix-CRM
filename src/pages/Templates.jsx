// Letter templates. The ones with a builder open it; the rest are listed so the team knows what is planned.
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import { DOC_TYPES } from '../lib/documents';
import { FileText, FileSignature, HandHeart, ShieldCheck, Heart, CalendarRange, ReceiptText, Info, ArrowRight } from 'lucide-react';
import './Documents.css';

const ICONS = { proposal: FileText, sow: FileSignature, welcome: HandHeart, nda: ShieldCheck, thank_you: Heart, milestones: CalendarRange, payment_ack: ReceiptText };
const BUILDERS = { proposal: '/templates/proposal', sow: '/templates/sow', milestones: '/templates/milestones', payment_ack: '/templates/payment-thanks', thank_you: '/templates/delivery-thanks', nda: '/templates/nda', welcome: '/templates/welcome' };   // letter id → its builder page

export default function Templates() {
  const ready = Object.keys(BUILDERS).length;
  return (
    <div>
      <Header title="Templates" subtitle={`${ready} ready · ${DOC_TYPES.length - ready} coming soon`} />
      <div className="page-body">
        <div className="doc-note">
          <Info size={15} aria-hidden="true" />
          <span>Open a ready template, fill in the client and project, choose a design and download the PDF. Letters that are not ready yet can still be uploaded under <strong>Client documents</strong>.</span>
        </div>
        <div className="tpl-grid">
          {[...DOC_TYPES].sort((a, b) => !!BUILDERS[b.id] - !!BUILDERS[a.id]).map(t => {
            const Icon = ICONS[t.id] || FileText;
            const body = (
              <>
                <span className="tpl-icon"><Icon size={20} aria-hidden="true" /></span>
                <span className="tpl-body">
                  <span className="tpl-name">{t.label}</span>
                  <span className="tpl-text">{t.text}</span>
                </span>
              </>
            );
            return BUILDERS[t.id] ? (
              <Link key={t.id} to={BUILDERS[t.id]} className="mac-card tpl-card tpl-card-ready">
                {body}
                <span className="tpl-open">Create <ArrowRight size={14} aria-hidden="true" /></span>
              </Link>
            ) : (
              <div key={t.id} className="mac-card tpl-card" aria-disabled="true">
                {body}
                <Badge color="purple">Coming soon</Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
