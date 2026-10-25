export function InlineError({ children, retry }: { children: React.ReactNode; retry?: React.ReactNode }) {
  return (
    <div className="form-error" role="alert">
      <p>{children}</p>
      {retry && <div className="actions">{retry}</div>}
    </div>
  );
}
