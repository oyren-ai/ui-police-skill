import { Slot } from "@radix-ui/react-slot";
export function Button(props: React.ComponentProps<"button">) {
  return <button data-slot="button" className="rounded-md bg-primary text-primary-foreground shadow-xs" {...props} />;
}
