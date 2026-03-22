import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  initialData?: any;
}

export function DepartmentModal({ isOpen, onClose, onSubmit, initialData }: DepartmentModalProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || "");
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsSubmitting(true);
    const success = await onSubmit({ name });
    setIsSubmitting(false);
    
    if (success) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? "Edit Department" : "New Department"}
      description="Enter the details for this department."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? "Saving..." : "Save Department"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2 text-slate-200">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Department Name</label>
          <Input
            placeholder="e.g. Computer Science"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            autoFocus
          />
        </div>
      </form>
    </Modal>
  );
}
