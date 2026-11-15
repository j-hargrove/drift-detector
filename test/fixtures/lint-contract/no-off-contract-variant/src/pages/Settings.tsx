import { Button } from '../components/Button';

export function Settings({ tone }: { tone: 'primary' | 'ghost' }) {
  return (
    <section>
      <Button variant="secondary">Cancel</Button>
      <Button variant="destructive">Delete account</Button>
      <Button
        variant={'danger-outline'}
      >
        Remove
      </Button>
      <Button variant={tone}>Dynamic, not checkable</Button>
      <IconButton variant="weird" />
    </section>
  );
}
