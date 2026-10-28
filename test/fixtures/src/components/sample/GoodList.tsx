import { Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubItem } from "@/components/ui/sidebar";
export function GoodList({ items, w }: { items: string[]; w: number }) {
  return (
    <SidebarMenu className="bg-card text-card-foreground rounded-lg border border-border p-3 flex flex-col gap-2" style={{ "--w": `${w}px` } as React.CSSProperties}>
      {items.map((i) => (
        <Collapsible key={i} asChild>
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton aria-label={`Toggle ${i}`} className="min-h-11 focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none">
                <Folder data-icon="inline-start" />
                <span className="truncate text-sm text-muted-foreground">{i}</span>
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub><SidebarMenuSubItem><Button variant="ghost" size="sm">Open</Button></SidebarMenuSubItem></SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      ))}
    </SidebarMenu>
  );
}
