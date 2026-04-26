type FaqItem = {
  question: string;
  answer: string;
};

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <article
          key={item.question}
          className="rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(28,25,51,0.56)] p-6 shadow-[var(--shadow-1)]"
        >
          <h2 className="mb-3 text-xl font-semibold text-[var(--c-text)]">
            {item.question}
          </h2>
          <p className="text-sm leading-6 text-[var(--c-text-muted)]">{item.answer}</p>
        </article>
      ))}
    </div>
  );
}

