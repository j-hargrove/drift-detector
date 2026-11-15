export function ButtonGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ display: 'flex', gap: 6, paddingTop: '20px' }}
    >
      {children}
    </div>
  );
}
