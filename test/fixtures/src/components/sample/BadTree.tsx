import { FaFolder } from "react-icons/fa";
export function BadTree({ items }: { items: string[] }) {
  return (
    <div role="tree" className="bg-white text-gray-700 rounded-lg shadow-xl p-[13px] h-[480px] overflow-y-auto">
      <button className="text-[13px] font-light" onClick={() => {}}>Expand</button>
      <ul className="overflow-y-auto dark:bg-zinc-900" style={{ color: "#333", padding: 12 }}>
        {items.map((i) => <li key={i} className="rounded-md" onClick={() => {}}>{i}</li>)}
      </ul>
      <svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>
      <input type="text" className="rounded-xl" />
    </div>
  );
}
