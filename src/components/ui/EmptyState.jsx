export default function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-black/[0.04] flex items-center justify-center mb-3">
          <Icon size={22} className="text-[#AEAEB2]" />
        </div>
      )}
      <p className="text-sm font-medium text-[#3C3C43]">{title}</p>
      {subtitle && <p className="text-xs text-[#AEAEB2] mt-1">{subtitle}</p>}
    </div>
  );
}
