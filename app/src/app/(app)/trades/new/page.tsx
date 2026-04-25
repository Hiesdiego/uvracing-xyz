"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft, Info } from "lucide-react";
import { useTradeActions } from "@/hooks/useTrade";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { cn } from "@/lib/utils";

type MilestoneRow = {
  description: string;
  release_percentage: number;
};

const DEFAULT_MILESTONES: MilestoneRow[] = [
  { description: "Shipping proof uploaded", release_percentage: 30 },
  { description: "Customs cleared / arrived at destination", release_percentage: 40 },
  { description: "Buyer confirms receipt of goods", release_percentage: 30 },
];

const GOODS_CATEGORIES = [
  "Fashion & Apparel",
  "Textiles & Fabrics",
  "Accessories",
  "Footwear",
  "Bags & Leather Goods",
  "Jewellery",
  "Other",
];

const CORRIDORS = ["NG-UAE", "GH-UAE", "SN-UAE", "CI-UAE"];

export default function NewTradePage() {
  const router = useRouter();
  const { createTrade, loading } = useTradeActions();

  const [form, setForm] = useState({
    goods_description: "",
    goods_category: "",
    quantity: "",
    total_amount_usdc: "",
    corridor: "NG-UAE",
    notes: "",
    pickup_location: "",
    dropoff_location: "",
    buyer_contact_name: "",
    buyer_contact_phone: "",
    supplier_contact_name: "",
    supplier_contact_phone: "",
    expected_ship_date: "",
    expected_delivery_date: "",
    shipping_reference: "",
    incoterm: "",
  });

  const [milestones, setMilestones] = useState<MilestoneRow[]>(
    DEFAULT_MILESTONES
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  const milestoneSum = milestones.reduce(
    (sum, m) => sum + Number(m.release_percentage),
    0
  );
  const sumValid = milestoneSum === 100;

  function updateMilestone(
    index: number,
    field: keyof MilestoneRow,
    value: string
  ) {
    setMilestones((prev) =>
      prev.map((m, i) =>
        i === index
          ? {
              ...m,
              [field]:
                field === "release_percentage" ? Number(value) : value,
            }
          : m
      )
    );
  }

  function addMilestone() {
    if (milestones.length >= 5) return;
    setMilestones((prev) => [
      ...prev,
      { description: "", release_percentage: 0 },
    ]);
  }

  function removeMilestone(index: number) {
    if (milestones.length <= 1) return;
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.goods_description.trim())
      e.goods_description = "Required";
    if (!form.total_amount_usdc || Number(form.total_amount_usdc) <= 0)
      e.total_amount_usdc = "Enter a valid amount";
    if (!sumValid)
      e.milestones = "Milestone percentages must sum to 100%";
    milestones.forEach((m, i) => {
      if (!m.description.trim())
        e[`milestone_${i}`] = "Description required";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const trade = await createTrade({
      goods_description: form.goods_description,
      goods_category: form.goods_category || undefined,
      quantity: form.quantity || undefined,
      total_amount_usdc: Number(form.total_amount_usdc),
      corridor: form.corridor,
      pickup_location: form.pickup_location || undefined,
      dropoff_location: form.dropoff_location || undefined,
      buyer_contact_name: form.buyer_contact_name || undefined,
      buyer_contact_phone: form.buyer_contact_phone || undefined,
      supplier_contact_name: form.supplier_contact_name || undefined,
      supplier_contact_phone: form.supplier_contact_phone || undefined,
      expected_ship_date: form.expected_ship_date || undefined,
      expected_delivery_date: form.expected_delivery_date || undefined,
      shipping_reference: form.shipping_reference || undefined,
      incoterm: form.incoterm || undefined,
      notes: form.notes || undefined,
      milestones,
    });

    router.push(`/trades/${trade.id}?created=1`);
  }

  return (
    <div className="max-w-2xl animate-fade-in">
      {/* Back */}
      <Link
        href="/trades"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to trades
      </Link>

      <h1 className="text-2xl font-bold mb-1">New Trade Order</h1>
      <p className="text-muted-foreground text-sm mb-8">
        Fill in the details - your supplier will receive an invite to accept.
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Goods details */}
        <section className="trade-card space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Goods Details
          </h2>

          <div className="space-y-2">
            <Label htmlFor="goods_description">
              Description <span className="text-red-400">*</span>
            </Label>
            <Textarea
              id="goods_description"
              placeholder="e.g. 50 rolls Ankara wax print fabric, assorted colours, 6 yards each"
              value={form.goods_description}
              onChange={(e) =>
                setForm((f) => ({ ...f, goods_description: e.target.value }))
              }
              className={cn(
                "bg-input border-border resize-none h-20",
                errors.goods_description && "border-red-400"
              )}
            />
            {errors.goods_description && (
              <p className="text-xs text-red-400">{errors.goods_description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.goods_category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, goods_category: v }))
                }
              >
                <SelectTrigger className="bg-input border-border">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {GOODS_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                placeholder="e.g. 50 rolls, 200 pcs"
                value={form.quantity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quantity: e.target.value }))
                }
                className="bg-input border-border"
              />
            </div>
          </div>
        </section>

        {/* Payment */}
        <section className="trade-card space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Payment
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="total_amount_usdc">
                Total Amount (USDC) <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  $
                </span>
                <Input
                  id="total_amount_usdc"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="0.00"
                  value={form.total_amount_usdc}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      total_amount_usdc: e.target.value,
                    }))
                  }
                  className={cn(
                    "bg-input border-border pl-7",
                    errors.total_amount_usdc && "border-red-400"
                  )}
                />
              </div>
              {errors.total_amount_usdc && (
                <p className="text-xs text-red-400">
                  {errors.total_amount_usdc}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Corridor</Label>
              <Select
                value={form.corridor}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, corridor: v }))
                }
              >
                <SelectTrigger className="bg-input border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORRIDORS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="trade-card space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Logistics & Contacts
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pickup_location">Pickup Location</Label>
              <Input
                id="pickup_location"
                value={form.pickup_location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pickup_location: e.target.value }))
                }
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dropoff_location">Dropoff Location</Label>
              <Input
                id="dropoff_location"
                value={form.dropoff_location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dropoff_location: e.target.value }))
                }
                className="bg-input border-border"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="buyer_contact_name">Buyer Contact Name</Label>
              <Input
                id="buyer_contact_name"
                value={form.buyer_contact_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, buyer_contact_name: e.target.value }))
                }
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buyer_contact_phone">Buyer Contact Phone</Label>
              <Input
                id="buyer_contact_phone"
                value={form.buyer_contact_phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, buyer_contact_phone: e.target.value }))
                }
                className="bg-input border-border"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier_contact_name">Supplier Contact Name</Label>
              <Input
                id="supplier_contact_name"
                value={form.supplier_contact_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, supplier_contact_name: e.target.value }))
                }
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier_contact_phone">Supplier Contact Phone</Label>
              <Input
                id="supplier_contact_phone"
                value={form.supplier_contact_phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, supplier_contact_phone: e.target.value }))
                }
                className="bg-input border-border"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expected_ship_date">Expected Ship Date</Label>
              <Input
                id="expected_ship_date"
                type="date"
                value={form.expected_ship_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expected_ship_date: e.target.value }))
                }
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected_delivery_date">Expected Delivery Date</Label>
              <Input
                id="expected_delivery_date"
                type="date"
                value={form.expected_delivery_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expected_delivery_date: e.target.value }))
                }
                className="bg-input border-border"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shipping_reference">Shipping Reference</Label>
              <Input
                id="shipping_reference"
                value={form.shipping_reference}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shipping_reference: e.target.value }))
                }
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="incoterm">Incoterm</Label>
              <Input
                id="incoterm"
                placeholder="e.g. FOB, CIF, EXW"
                value={form.incoterm}
                onChange={(e) =>
                  setForm((f) => ({ ...f, incoterm: e.target.value }))
                }
                className="bg-input border-border"
              />
            </div>
          </div>
        </section>

        {/* Milestones */}
        <section className="trade-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Payment Milestones
            </h2>
            <div
              className={cn(
                "text-xs font-mono px-2 py-0.5 rounded-full border",
                sumValid
                  ? "border-green-500/30 text-green-400 bg-green-500/5"
                  : "border-red-400/30 text-red-400 bg-red-400/5"
              )}
            >
              {milestoneSum}% / 100%
            </div>
          </div>

          <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-[hsl(var(--gold)/0.05)] border border-[hsl(var(--gold)/0.2)]">
            <Info className="w-3.5 h-3.5 text-gold mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              USDC releases to the supplier when each milestone is confirmed.
              All percentages must total 100%.
            </p>
          </div>

          <div className="space-y-3">
            {milestones.map((m, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0 mt-2">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {i + 1}
                  </span>
                </div>

                <div className="flex-1 grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Input
                      placeholder="Milestone description"
                      value={m.description}
                      onChange={(e) =>
                        updateMilestone(i, "description", e.target.value)
                      }
                      className={cn(
                        "bg-input border-border text-sm",
                        errors[`milestone_${i}`] && "border-red-400"
                      )}
                    />
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="0"
                      value={m.release_percentage || ""}
                      onChange={(e) =>
                        updateMilestone(
                          i,
                          "release_percentage",
                          e.target.value
                        )
                      }
                      className="bg-input border-border text-sm pr-7"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                      %
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeMilestone(i)}
                  disabled={milestones.length === 1}
                  className="mt-2 text-muted-foreground hover:text-red-400 disabled:opacity-30 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {errors.milestones && (
            <p className="text-xs text-red-400">{errors.milestones}</p>
          )}

          {milestones.length < 5 && (
            <button
              type="button"
              onClick={addMilestone}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add milestone
            </button>
          )}
        </section>

        {/* Notes */}
        <section className="trade-card space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Notes (Optional)
          </h2>
          <Textarea
            placeholder="Any additional instructions for the supplier..."
            value={form.notes}
            onChange={(e) =>
              setForm((f) => ({ ...f, notes: e.target.value }))
            }
            className="bg-input border-border resize-none h-20"
          />
        </section>

        {/* Submit */}
        <div className="flex items-center gap-3 pb-8">
          <Button
            type="submit"
            disabled={loading || !sumValid}
            className="gradient-gold text-black font-semibold hover:opacity-90 glow-gold"
          >
            {loading ? "Creating..." : "Create Trade Order"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/trades">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
