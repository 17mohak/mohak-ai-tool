import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export interface FacultyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  initialData?: any;
  departments: any[];
  selectedDept?: number | null;
}

export function FacultyModal({ isOpen, onClose, onSubmit, initialData, departments, selectedDept }: FacultyModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [maxClasses, setMaxClasses] = useState(4);
  const [startSlot, setStartSlot] = useState(1);
  const [endSlot, setEndSlot] = useState(8);
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || "");
      setEmail(initialData?.email || "");
      setMaxClasses(initialData?.max_classes_per_day || 4);
      setStartSlot(initialData?.preferred_start_slot || 1);
      setEndSlot(initialData?.preferred_end_slot || 8);
      setDepartmentId(initialData?.department_id || selectedDept || "");
    }
  }, [isOpen, initialData, selectedDept]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || departmentId === "") return;
    
    setIsSubmitting(true);
    const success = await onSubmit({
      name,
      email: email || null,
      max_classes_per_day: Number(maxClasses),
      preferred_start_slot: Number(startSlot),
      preferred_end_slot: Number(endSlot),
      department_id: Number(departmentId),
    });
    setIsSubmitting(false);
    
    if (success) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? "Edit Faculty" : "New Faculty"}
      description="Add a new instructor to the system."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting || !name.trim() || departmentId === ""}>
            {isSubmitting ? "Saving..." : "Save Faculty"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2 text-slate-200">
        <div className="grid grid-cols-2 gap-4">
           {/* Basic Info */}
           <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium text-slate-300">Department</label>
            <Select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={isSubmitting || !!selectedDept}
            >
              <option value="" disabled>Select Department</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2 col-span-2 sm:col-span-1">
             <label className="text-sm font-medium text-slate-300">Full Name</label>
             <Input
               placeholder="e.g. Dr. Alan Turing"
               value={name}
               onChange={(e) => setName(e.target.value)}
               disabled={isSubmitting}
             />
          </div>

          <div className="space-y-2 col-span-2 sm:col-span-1">
             <label className="text-sm font-medium text-slate-300">Email Address</label>
             <Input
               type="email"
               placeholder="e.g. alan@atlas.edu"
               value={email}
               onChange={(e) => setEmail(e.target.value)}
               disabled={isSubmitting}
             />
          </div>

          {/* Preferences */}
          <div className="col-span-2 my-2 border-t border-slate-700/50 pt-4">
             <h4 className="text-sm font-medium text-indigo-400 mb-4">Availability Preferences</h4>
             <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-sm font-medium text-slate-300">Max Classes / Day</label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={maxClasses}
                    onChange={(e) => setMaxClasses(Number(e.target.value))}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-2"/>

                <div className="col-span-2 sm:col-span-1 space-y-2">
                   <label className="text-sm font-medium text-slate-300">Preferred Start Slot</label>
                   <Select
                     value={startSlot}
                     onChange={(e) => setStartSlot(Number(e.target.value))}
                     disabled={isSubmitting}
                   >
                     {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Slot {s}</option>)}
                   </Select>
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-2">
                   <label className="text-sm font-medium text-slate-300">Preferred End Slot</label>
                   <Select
                     value={endSlot}
                     onChange={(e) => setEndSlot(Number(e.target.value))}
                     disabled={isSubmitting}
                   >
                     {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Slot {s}</option>)}
                   </Select>
                </div>
             </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
