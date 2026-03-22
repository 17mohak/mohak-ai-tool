import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface UseOptimisticCrudOptions<T> {
  setData: React.Dispatch<React.SetStateAction<T[] | null>>;
  refresh: () => Promise<void>;
  generateTempId?: () => any;
  nameExtractor?: (item: any) => string;
}

export function useOptimisticCrud<T extends { id: any }>(
  endpoint: string,
  { setData, refresh, generateTempId = () => Date.now() * -1, nameExtractor = (item: any) => item.name || "Item" }: UseOptimisticCrudOptions<T>
) {
  const { toast } = useToast();
  const [isMutating, setIsMutating] = useState(false);

  const createItem = async (payload: any) => {
    setIsMutating(true);
    const tempId = generateTempId();
    const tempItem = { ...payload, id: tempId } as T;

    // Optimistic Update
    setData((prev) => (prev ? [...prev, tempItem] : [tempItem]));

    try {
      // API Call
      await api(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      toast({
        title: "Success",
        description: `${nameExtractor(payload)} created successfully.`,
        type: "success",
      });

      // User Req: trigger a background refetch to ensure UI doesn't drift
      await refresh();
      return true;
    } catch (err: any) {
      // Rollback
      setData((prev) => (prev ? prev.filter((item) => item.id !== tempId) : prev));
      toast({
        title: "Error",
        description: err.message || `Failed to create ${nameExtractor(payload)}.`,
        type: "error",
      });
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const updateItem = async (id: any, payload: any) => {
    setIsMutating(true);
    let previousState: T[] | null = null;

    // Optimistic Update
    setData((prev) => {
      previousState = prev;
      return prev ? prev.map((item) => (item.id === id ? { ...item, ...payload } : item)) : prev;
    });

    try {
      await api(`${endpoint}/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      toast({
        title: "Success",
        description: `${nameExtractor(payload)} updated successfully.`,
        type: "success",
      });

      await refresh();
      return true;
    } catch (err: any) {
      // Rollback
      if (previousState) setData(previousState);
      toast({
        title: "Error",
        description: err.message || `Failed to update ${nameExtractor(payload)}.`,
        type: "error",
      });
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const deleteItem = async (id: any, itemName?: string) => {
    setIsMutating(true);
    let previousState: T[] | null = null;

    // Optimistic Update
    setData((prev) => {
      previousState = prev;
      return prev ? prev.filter((item) => item.id !== id) : prev;
    });

    try {
      await api(`${endpoint}/${id}`, {
        method: "DELETE",
      });

      toast({
        title: "Deleted",
        description: `${itemName || "Item"} has been removed.`,
        type: "success",
      });

      await refresh();
      return true;
    } catch (err: any) {
      // Rollback
      if (previousState) setData(previousState);
      toast({
        title: "Error",
        description: err.message || "Failed to delete item.",
        type: "error",
      });
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  return { createItem, updateItem, deleteItem, isMutating };
}
