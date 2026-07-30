"use client";

import styles from "./CatalogEditor.module.css";

interface TextFieldProps {
  id: string;
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  error?: string;
  help?: string;
  multiline?: boolean;
  readOnly?: boolean;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  help,
  multiline = false,
  readOnly = false,
}: TextFieldProps) {
  const describedBy = [
    help ? `${id}-help` : "",
    error ? `${id}-error` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const common = {
    id,
    value: value ?? "",
    readOnly,
    "aria-invalid": Boolean(error),
    "aria-describedby": describedBy || undefined,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
  };

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea className={styles.textarea} {...common} />
      ) : (
        <input className={styles.input} {...common} />
      )}
      {help ? (
        <span className={styles.help} id={`${id}-help`}>
          {help}
        </span>
      ) : null}
      {error ? (
        <span className={styles.fieldError} id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

interface StringListEditorProps {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  error?: string;
  minimum?: number;
  maximum?: number;
  readOnly?: boolean;
}

export function StringListEditor({
  id,
  label,
  values,
  onChange,
  error,
  minimum = 0,
  maximum,
  readOnly = false,
}: StringListEditorProps) {
  function update(index: number, value: string) {
    onChange(values.map((current, currentIndex) => (currentIndex === index ? value : current)));
  }

  function remove(index: number) {
    onChange(values.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <fieldset className={styles.repeater}>
      <legend className={styles.legend}>{label}</legend>
      {values.map((value, index) => (
        <div className={styles.repeaterItem} key={`${id}-${index}`}>
          <TextField
            id={`${id}-${index}`}
            label={`${label} ${index + 1}`}
            value={value}
            onChange={(next) => update(index, next)}
            readOnly={readOnly}
          />
          <button
            className={`${styles.button} ${styles.buttonDanger}`}
            type="button"
            disabled={readOnly || values.length <= minimum}
            onClick={() => remove(index)}
          >
            Remove
          </button>
        </div>
      ))}
      {error ? <p className={styles.fieldError}>{error}</p> : null}
      <button
        className={`${styles.button} ${styles.buttonSecondary}`}
        type="button"
        disabled={
          readOnly || (maximum !== undefined && values.length >= maximum)
        }
        onClick={() => onChange([...values, ""])}
      >
        Add {label.toLowerCase()}
      </button>
    </fieldset>
  );
}
