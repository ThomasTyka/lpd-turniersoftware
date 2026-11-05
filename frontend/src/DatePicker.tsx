import { useEffect, useRef } from 'react'
import flatpickr from 'flatpickr'
import { German } from 'flatpickr/dist/l10n/de.js'
import type { Instance } from 'flatpickr/dist/types/instance'
import 'flatpickr/dist/flatpickr.css'
import './datepicker-theme.css'

const pad = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DDTHH:mm", the same shape a native datetime-local input produces. */
function toIsoLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Datum/Uhrzeit-Auswahl passend zur Regie-Optik - der native
 * datetime-local-Picker (siehe index.css) lässt sich nur bis zu einer
 * Grenze umfärben, das Kalender-Popup selbst ist Browser-Chrome und für
 * CSS unerreichbar. flatpickr rendert sein Popup als eigenes DOM-Element,
 * das sich vollständig gestalten lässt (datepicker-theme.css).
 *
 * A single input, not flatpickr's altInput (a second, separately-inserted
 * field) - that second field turned out to fight with React's own
 * reconciliation of the same DOM node and rendered as two visible boxes.
 * The display format (German, "15.08.2026, 14:30") and the value format
 * ("YYYY-MM-DDTHH:mm", what the rest of the form/API expects) are decoupled
 * instead: onChange converts from flatpickr's selected Date directly,
 * rather than parsing the displayed string.
 */
export function DatePicker({
  value,
  onChange,
  required,
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const fpRef = useRef<Instance | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!inputRef.current) return
    fpRef.current = flatpickr(inputRef.current, {
      enableTime: true,
      time_24hr: true,
      dateFormat: 'd.m.Y, H:i',
      locale: German,
      onChange: (selectedDates) => {
        if (selectedDates[0]) onChangeRef.current(toIsoLocal(selectedDates[0]))
      },
    })
    return () => fpRef.current?.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!fpRef.current) return
    const current = fpRef.current.selectedDates[0] ? toIsoLocal(fpRef.current.selectedDates[0]) : ''
    if (current === value) return
    if (value) fpRef.current.setDate(value, false)
    else fpRef.current.clear(false)
  }, [value])

  return <input ref={inputRef} type="text" required={required} placeholder="Datum wählen…" readOnly />
}
