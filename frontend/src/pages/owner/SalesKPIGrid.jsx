export default function SalesKPIGrid({ dash, variant = 'default' }) {
  const cards = dash?.cards || {};

  const items = [
    { key: 'total_leads', label: 'Total Leads', value: cards.total_leads ?? 0 },
    { key: 'working_leads', label: 'Working Leads', value: cards.working_leads ?? 0 },
    { key: 'not_working_leads', label: 'Not Working Leads', value: cards.not_working_leads ?? 0 },
    { key: 'converted_leads', label: 'Converted', value: cards.converted_leads ?? 0 },
    { key: 'transferred_leads', label: 'Transferred', value: cards.transferred_leads ?? 0 },
    { key: 'callback_requested', label: 'Callback Requested', value: cards.callback_requested ?? 0 },
    { key: 'today_follow_ups', label: 'Follow-ups Today', value: cards.today_follow_ups ?? 0 },
    { key: 'overdue_follow_ups', label: 'Overdue Follow-ups', value: cards.overdue_follow_ups ?? 0 },
    { key: 'conversion_rate', label: 'Conversion %', value: cards.conversion_rate ?? 0 },
  ];

  const gridClass = variant === 'compact'
    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3'
    : 'grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3';

  return (
    <div className={gridClass}>
      {items.map((s) => (
        <div key={s.key} className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-sm text-center">
          <p className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">{s.label}</p>
          <p className="text-white font-heading font-bold text-xl mt-1">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

