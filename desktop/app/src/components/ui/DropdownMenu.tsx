import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";

export const DropdownMenu = RadixDropdown.Root;
export const DropdownMenuTrigger = RadixDropdown.Trigger;

interface Item {
  value: string;
  label: string;
}

interface DropdownSelectProps {
  value: string;
  items: Item[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function DropdownSelect({ value, items, onChange, placeholder = "Select…", className = "" }: DropdownSelectProps) {
  const current = items.find((i) => i.value === value);

  return (
    <RadixDropdown.Root>
      <RadixDropdown.Trigger
        className={`dropdown-trigger ${className}`}
        aria-label={placeholder}
      >
        <span className="truncate">{current?.label ?? placeholder}</span>
        <ChevronDown size={12} className="shrink-0 text-muted" />
      </RadixDropdown.Trigger>

      <RadixDropdown.Portal>
        <RadixDropdown.Content
          className="dropdown-content"
          sideOffset={4}
          align="start"
          collisionPadding={8}
        >
          {items.map((item) => (
            <RadixDropdown.Item
              key={item.value}
              className="dropdown-item"
              onSelect={() => onChange(item.value)}
            >
              <span className="flex-1 truncate">{item.label}</span>
              {value === item.value && <Check size={12} className="text-accent shrink-0" />}
            </RadixDropdown.Item>
          ))}
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}
