/**
 * Sirve imágenes de Supabase Storage con transformación on-the-fly.
 * Las transformaciones (/render/image/) requieren plan Pro de Supabase.
 * Al subir de plan: descomentar el bloque de transformación.
 */
export function getImageUrl(
  url: string | null | undefined,
  width: number,
  quality = 75,
): string | undefined {
  if (!url) return undefined;
  if (!url.includes('supabase.co/storage')) return url;
  const base = url.replace('/object/public/', '/render/image/public/');
  const sep  = base.includes('?') ? '&' : '?';
  return `${base}${sep}width=${width}&quality=${quality}`;
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG  = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DAYS_SHORT   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Formatea una fecha ISO (YYYY-MM-DD) como "15 mar" sin desfase de timezone.
 */
export const safeFormatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  try {
    const [, month, day] = dateStr.split('T')[0].split('-');
    return `${day} ${MONTHS_SHORT[parseInt(month, 10) - 1]}`;
  } catch {
    return dateStr;
  }
};

/**
 * Formatea una fecha ISO como "Vie 20 Mar".
 */
export const formatDayShort = (dateStr?: string): string => {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    return `${DAYS_SHORT[dateObj.getDay()]} ${day} ${MONTHS_LONG[dateObj.getMonth()]}`;
  } catch {
    return dateStr;
  }
};

/**
 * Formatea una fecha + hora como "Vie 15 de Mar, 9:00 PM".
 */
export const formatEventDateTime = (dateStr?: string, timeStr?: string): string => {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);

    const dayName   = DAYS_SHORT[dateObj.getDay()];
    const monthName = MONTHS_LONG[dateObj.getMonth()];

    let timeFormatted = '';
    if (timeStr) {
      const [hoursStr, minutesStr] = timeStr.split(':');
      let hours = parseInt(hoursStr, 10);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      timeFormatted = `, ${hours}:${minutesStr} ${ampm}`;
    }

    return `${dayName} ${day} de ${monthName}${timeFormatted}`;
  } catch {
    return dateStr;
  }
};

interface EventLike {
  is_active?: boolean;
  status?: string;
  end_date?: string;
  date?: string;
  end_time?: string;
  hour?: string;
}

/**
 * Determina si un evento ya terminó según su estado o fecha/hora de finalización.
 */
export const isEventFinished = (evt?: EventLike | null): boolean => {
  if (!evt) return false;
  if (evt.is_active === false) return true;
  if (evt.status === 'finished' || evt.status === 'inactive') return true;

  const dateStr = evt.end_date || evt.date;
  const timeStr = evt.end_time || evt.hour || '05:00';

  if (dateStr) {
    return new Date(`${dateStr}T${timeStr}`) < new Date();
  }
  return false;
};
