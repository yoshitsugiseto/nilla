const MS_PER_DAY = 86400000

/**
 * Compute a deadline display label with urgency styling.
 *
 * Returns a Japanese text description and a Tailwind CSS className
 * based on how many days remain until the given end date.
 */
export function deadlineLabel(endDate: string): { text: string; className: string } {
  const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / MS_PER_DAY)
  if (days < 0)   return { text: `${Math.abs(days)}日超過`, className: 'text-red-600 font-semibold' }
  if (days === 0)  return { text: '今日が期限',              className: 'text-red-600 font-semibold' }
  if (days <= 2)   return { text: `残り${days}日`,           className: 'text-orange-500 font-semibold' }
  if (days <= 5)   return { text: `残り${days}日`,           className: 'text-yellow-600 font-medium' }
  return                { text: `残り${days}日`,             className: 'text-gray-400' }
}
