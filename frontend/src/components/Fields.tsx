// 共用表單欄位：數值輸入與下拉選單，供各領域參數面板使用。

export function NumberField({
  label,
  value,
  onChange,
  step,
  suffix,
  placeholder,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  step?: number;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <div className="field-label">{label}</div>
      <div className="field-row">
        <input
          className="input"
          type="number"
          value={value}
          step={step ?? "any"}
          placeholder={placeholder}
          // 避免滑鼠滾輪停在數值欄上時，捲動頁面誤改數值。
          onWheel={(e) => e.currentTarget.blur()}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? "" : Number(raw));
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="field">
      <div className="field-label">{label}</div>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
