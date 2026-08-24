import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { logAuditEvent } from '../utils/auditLogger';
import { SuccessNotification } from '../components/SuccessNotification';
import {
  Store,
  Package,
  Tag,
  ShoppingBag,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Send,
  X,
  ShieldAlert,
  Layers,
  TrendingUp,
} from 'lucide-react';

type Tab = 'browse' | 'my-listings' | 'eligible' | 'bids-received' | 'my-bids' | 'successful-bids';

interface ProcessingBatch {
  id: string;
  intake_batch_reference: string;
  post_processing_weight_kg: number | null;
  original_quantity_kg: number;
  status: string;
  actual_processing_completion_date: string | null;
  sorted_intake_id: string;
}

interface BatchWithSorted extends ProcessingBatch {
  sorted_intake?: {
    plastic_type_names: string;
    grade: string;
    colour: string;
  } | null;
}

interface Listing {
  id: string;
  processing_batch_id: string;
  seller_id: string;
  quantity_kg: number;
  offer_price_per_kg: number;
  status: 'active' | 'sold' | 'withdrawn';
  published_at: string;
  created_at: string;
}

interface ListingWithBatch extends Listing {
  batch?: {
    intake_batch_reference: string;
    sorted_intake?: {
      plastic_type_names: string;
      grade: string;
      colour: string;
    } | null;
  } | null;
  bid_count?: number;
}

interface Bid {
  id: string;
  listing_id: string;
  buyer_id: string;
  bid_quantity_kg: number;
  bid_price_per_kg: number;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  response_note: string | null;
  seller_response_at: string | null;
  buyer_seen_response: boolean;
  created_at: string;
}

interface BidWithListing extends Bid {
  listing?: {
    quantity_kg: number;
    offer_price_per_kg: number;
    status: string;
    batch?: {
      intake_batch_reference: string;
      sorted_intake?: {
        plastic_type_names: string;
        grade: string;
      } | null;
    } | null;
  } | null;
}

interface LabResult {
  id: string;
  result: string | null;
  approval_status: string;
  notes: string | null;
  test: { name: string; unit_of_measure: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  sold: 'bg-slate-200 text-slate-800',
  withdrawn: 'bg-amber-100 text-amber-800',
  pending: 'bg-blue-100 text-blue-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
};

export function Marketplace() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [businessCategory, setBusinessCategory] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('browse');

  const [eligibleBatches, setEligibleBatches] = useState<BatchWithSorted[]>([]);
  const [myListings, setMyListings] = useState<ListingWithBatch[]>([]);
  const [activeListings, setActiveListings] = useState<ListingWithBatch[]>([]);
  const [bidsReceived, setBidsReceived] = useState<(Bid & { listing?: ListingWithBatch | null })[]>([]);
  const [pendingBidsCount, setPendingBidsCount] = useState(0);
  const [myBids, setMyBids] = useState<BidWithListing[]>([]);
  const [successfulBids, setSuccessfulBids] = useState<BidWithListing[]>([]);
  const [unseenMyBidsCount, setUnseenMyBidsCount] = useState(0);
  const [unseenSuccessfulBidsCount, setUnseenSuccessfulBidsCount] = useState(0);

  const [publishModalBatch, setPublishModalBatch] = useState<BatchWithSorted | null>(null);
  const [publishQty, setPublishQty] = useState('');
  const [publishPrice, setPublishPrice] = useState('');
  const [publishing, setPublishing] = useState(false);

  const [bidModalListing, setBidModalListing] = useState<ListingWithBatch | null>(null);
  const [bidQty, setBidQty] = useState('');
  const [bidPrice, setBidPrice] = useState('');
  const [bidding, setBidding] = useState(false);

  const [resultsModalListing, setResultsModalListing] = useState<ListingWithBatch | null>(null);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);

  const [respondModalBid, setRespondModalBid] = useState<(Bid & { listing?: ListingWithBatch | null }) | null>(null);
  const [respondAction, setRespondAction] = useState<'accept' | 'reject'>('accept');
  const [respondNote, setRespondNote] = useState('');
  const [responding, setResponding] = useState(false);

  const isSeller = businessCategory === 'Recycler' && userStatus === 'approved';
  const isBuyer = businessCategory === 'Packaging Manufacturer' && userStatus === 'approved';
  const isAdmin = userRole === 'admin';

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          navigate('/login');
          return;
        }
        setUserId(user.id);

        const { data: u } = await supabase
          .from('users')
          .select('role, status')
          .eq('id', user.id)
          .maybeSingle();

        setUserRole(u?.role ?? null);
        setUserStatus(u?.status ?? null);

        if (u?.role === 'customer') {
          const { data: profile } = await supabase
            .from('customer_profiles')
            .select('business_categories(name)')
            .eq('user_id', user.id)
            .maybeSingle();
          setBusinessCategory((profile as any)?.business_categories?.name ?? null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load user context');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (loading) return;
    if (isAdmin) {
      setActiveTab('browse');
    } else if (isSeller) {
      setActiveTab('my-listings');
    } else if (isBuyer) {
      setActiveTab('browse');
    }
  }, [loading, isAdmin, isSeller, isBuyer]);

  useEffect(() => {
    if (loading || !userId) return;
    refresh();
  }, [loading, userId, activeTab]);

  useEffect(() => {
    if (loading || !userId) return;
    if (isSeller || isAdmin) {
      loadPendingBidsCount();
    }
  }, [loading, userId, isSeller, isAdmin]);

  useEffect(() => {
    if (loading || !userId) return;
    if (isBuyer || isAdmin) {
      loadBuyerNotificationCounts();
    }
  }, [loading, userId, isBuyer, isAdmin]);

  const refresh = async () => {
    try {
      setError(null);
      if (activeTab === 'browse') await loadActiveListings();
      if (activeTab === 'my-listings') await loadMyListings();
      if (activeTab === 'eligible') await loadEligibleBatches();
      if (activeTab === 'bids-received') await loadBidsReceived();
      if (activeTab === 'my-bids') await loadMyBids();
      if (activeTab === 'successful-bids') await loadSuccessfulBids();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marketplace data');
    }
  };

  const loadActiveListings = async () => {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select(
        `id, processing_batch_id, seller_id, quantity_kg, offer_price_per_kg, status, published_at, created_at,
         batch:sorted_plastic_intake_processing!processing_batch_id(
           intake_batch_reference,
           sorted_intake:sorted_plastic_intake!sorted_intake_id(plastic_type_names, grade, colour)
         )`,
      )
      .eq('status', 'active')
      .order('published_at', { ascending: false });
    if (error) throw error;
    setActiveListings((data as any) || []);
  };

  const loadMyListings = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select(
        `id, processing_batch_id, seller_id, quantity_kg, offer_price_per_kg, status, published_at, created_at,
         batch:sorted_plastic_intake_processing!processing_batch_id(
           intake_batch_reference,
           sorted_intake:sorted_plastic_intake!sorted_intake_id(plastic_type_names, grade, colour)
         ),
         marketplace_bids(count)`,
      )
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const mapped = ((data as any[]) || []).map((row) => ({
      ...row,
      bid_count: row.marketplace_bids?.[0]?.count ?? 0,
    }));
    setMyListings(mapped);
  };

  const loadEligibleBatches = async () => {
    if (!userId) return;
    const { data: batches, error: bErr } = await supabase
      .from('sorted_plastic_intake_processing')
      .select(
        `id, intake_batch_reference, post_processing_weight_kg, original_quantity_kg, status,
         actual_processing_completion_date, sorted_intake_id,
         sorted_intake:sorted_plastic_intake!sorted_intake_id(plastic_type_names, grade, colour)`,
      )
      .eq('created_by', userId)
      .in('status', ['completed', 'lab']);
    if (bErr) throw bErr;

    const batchList = (batches as any[]) || [];
    if (batchList.length === 0) {
      setEligibleBatches([]);
      return;
    }

    const batchIds = batchList.map((b) => b.id);

    const { data: ordersData } = await supabase
      .from('orders')
      .select('processing_batch_id, status')
      .in('processing_batch_id', batchIds);

    const approvedSet = new Set(
      (ordersData || [])
        .filter((o: any) => o.status === 'results_approved')
        .map((o: any) => o.processing_batch_id),
    );

    const { data: existingListings } = await supabase
      .from('marketplace_listings')
      .select('processing_batch_id, status')
      .in('processing_batch_id', batchIds)
      .eq('status', 'active');

    const listedSet = new Set((existingListings || []).map((l: any) => l.processing_batch_id));

    const eligible = batchList
      .filter((b) => approvedSet.has(b.id) && !listedSet.has(b.id))
      .map((b) => ({ ...b }));
    setEligibleBatches(eligible);
  };

  const loadBidsReceived = async () => {
    if (!userId) return;
    const { data: listings, error: lErr } = await supabase
      .from('marketplace_listings')
      .select(
        `id, processing_batch_id, seller_id, quantity_kg, offer_price_per_kg, status, published_at, created_at,
         batch:sorted_plastic_intake_processing!processing_batch_id(
           intake_batch_reference,
           sorted_intake:sorted_plastic_intake!sorted_intake_id(plastic_type_names, grade, colour)
         )`,
      )
      .eq('seller_id', userId);
    if (lErr) throw lErr;

    const listingIds = ((listings as any[]) || []).map((l) => l.id);
    if (listingIds.length === 0) {
      setBidsReceived([]);
      return;
    }

    const { data: bids, error: bErr } = await supabase
      .from('marketplace_bids')
      .select('*')
      .in('listing_id', listingIds)
      .order('created_at', { ascending: false });
    if (bErr) throw bErr;

    const listingMap = new Map<string, ListingWithBatch>(
      ((listings as any[]) || []).map((l) => [l.id, l]),
    );
    const merged = ((bids as any[]) || []).map((b) => ({
      ...b,
      listing: listingMap.get(b.listing_id) ?? null,
    }));
    setBidsReceived(merged);
    setPendingBidsCount(merged.filter((b) => b.status === 'pending').length);
  };

  const loadPendingBidsCount = async () => {
    if (!userId) return;
    const { data: listings, error: lErr } = await supabase
      .from('marketplace_listings')
      .select('id')
      .eq('seller_id', userId);
    if (lErr) return;

    const listingIds = ((listings as any[]) || []).map((l) => l.id);
    if (listingIds.length === 0) {
      setPendingBidsCount(0);
      return;
    }

    const { count, error: cErr } = await supabase
      .from('marketplace_bids')
      .select('id', { count: 'exact', head: true })
      .in('listing_id', listingIds)
      .eq('status', 'pending');
    if (cErr) return;
    setPendingBidsCount(count ?? 0);
  };

  const loadMyBids = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('marketplace_bids')
      .select(
        `*,
         listing:marketplace_listings!listing_id(
           quantity_kg, offer_price_per_kg, status,
           batch:sorted_plastic_intake_processing!processing_batch_id(
             intake_batch_reference,
             sorted_intake:sorted_plastic_intake!sorted_intake_id(plastic_type_names, grade)
           )
         )`,
      )
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    setMyBids((data as any) || []);

    const unseen = ((data as any[]) || []).filter(
      (b) => !b.buyer_seen_response && b.status === 'rejected',
    );
    if (unseen.length > 0) {
      await supabase
        .from('marketplace_bids')
        .update({ buyer_seen_response: true })
        .in(
          'id',
          unseen.map((b) => b.id),
        );
      loadBuyerNotificationCounts();
    }
  };

  const loadSuccessfulBids = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('marketplace_bids')
      .select(
        `*,
         listing:marketplace_listings!listing_id(
           quantity_kg, offer_price_per_kg, status,
           batch:sorted_plastic_intake_processing!processing_batch_id(
             intake_batch_reference,
             sorted_intake:sorted_plastic_intake!sorted_intake_id(plastic_type_names, grade)
           )
         )`,
      )
      .eq('buyer_id', userId)
      .eq('status', 'accepted')
      .order('seller_response_at', { ascending: false });
    if (error) throw error;
    setSuccessfulBids((data as any) || []);

    const unseen = ((data as any[]) || []).filter((b) => !b.buyer_seen_response);
    if (unseen.length > 0) {
      await supabase
        .from('marketplace_bids')
        .update({ buyer_seen_response: true })
        .in(
          'id',
          unseen.map((b) => b.id),
        );
      loadBuyerNotificationCounts();
    }
  };

  const loadBuyerNotificationCounts = async () => {
    if (!userId) return;
    const { count: rejectedCount } = await supabase
      .from('marketplace_bids')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', userId)
      .eq('status', 'rejected')
      .eq('buyer_seen_response', false);
    setUnseenMyBidsCount(rejectedCount ?? 0);

    const { count: acceptedCount } = await supabase
      .from('marketplace_bids')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', userId)
      .eq('status', 'accepted')
      .eq('buyer_seen_response', false);
    setUnseenSuccessfulBidsCount(acceptedCount ?? 0);
  };

  const openPublishModal = (batch: BatchWithSorted) => {
    setPublishModalBatch(batch);
    const max = batch.post_processing_weight_kg ?? batch.original_quantity_kg;
    setPublishQty(String(max));
    setPublishPrice('');
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishModalBatch || !userId) return;
    const qty = parseFloat(publishQty);
    const price = parseFloat(publishPrice);
    const max = publishModalBatch.post_processing_weight_kg ?? publishModalBatch.original_quantity_kg;
    if (!(qty > 0)) {
      setError('Quantity must be greater than zero');
      return;
    }
    if (qty > max) {
      setError(`Quantity cannot exceed available weight (${max} kg)`);
      return;
    }
    if (!(price > 0)) {
      setError('Offer price must be greater than zero');
      return;
    }

    setPublishing(true);
    try {
      const { data, error } = await supabase
        .from('marketplace_listings')
        .insert({
          processing_batch_id: publishModalBatch.id,
          seller_id: userId,
          quantity_kg: qty,
          offer_price_per_kg: price,
        })
        .select()
        .single();
      if (error) throw error;

      await logAuditEvent('CREATE_LISTING', 'marketplace_listings', data.id, {
        batch_reference: publishModalBatch.intake_batch_reference,
        quantity_kg: qty,
        offer_price_per_kg: price,
      });

      setSuccess('Lot published to marketplace');
      setPublishModalBatch(null);
      setActiveTab('my-listings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish lot');
    } finally {
      setPublishing(false);
    }
  };

  const handleWithdrawListing = async (listing: ListingWithBatch) => {
    if (!confirm('Withdraw this listing? Pending bids will be auto-withdrawn.')) return;
    try {
      const { error: lErr } = await supabase
        .from('marketplace_listings')
        .update({ status: 'withdrawn' })
        .eq('id', listing.id);
      if (lErr) throw lErr;

      await supabase
        .from('marketplace_bids')
        .update({ status: 'withdrawn' })
        .eq('listing_id', listing.id)
        .eq('status', 'pending');

      await logAuditEvent('WITHDRAW_LISTING', 'marketplace_listings', listing.id);
      setSuccess('Listing withdrawn');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to withdraw listing');
    }
  };

  const openBidModal = (listing: ListingWithBatch) => {
    setBidModalListing(listing);
    setBidQty(String(listing.quantity_kg));
    setBidPrice(String(listing.offer_price_per_kg));
  };

  const handlePlaceBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bidModalListing || !userId) return;
    const qty = parseFloat(bidQty);
    const price = parseFloat(bidPrice);
    if (!(qty > 0) || qty > bidModalListing.quantity_kg) {
      setError(`Bid quantity must be > 0 and <= ${bidModalListing.quantity_kg} kg`);
      return;
    }
    if (!(price > 0)) {
      setError('Bid price must be greater than zero');
      return;
    }

    setBidding(true);
    try {
      const { data, error } = await supabase
        .from('marketplace_bids')
        .insert({
          listing_id: bidModalListing.id,
          buyer_id: userId,
          bid_quantity_kg: qty,
          bid_price_per_kg: price,
        })
        .select()
        .single();
      if (error) throw error;

      await logAuditEvent('PLACE_BID', 'marketplace_bids', data.id, {
        listing_id: bidModalListing.id,
        bid_quantity_kg: qty,
        bid_price_per_kg: price,
      });

      setSuccess('Bid placed');
      setBidModalListing(null);
      setActiveTab('my-bids');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place bid');
    } finally {
      setBidding(false);
    }
  };

  const handleWithdrawBid = async (bid: Bid) => {
    if (!confirm('Withdraw this bid?')) return;
    try {
      const { error } = await supabase
        .from('marketplace_bids')
        .update({ status: 'withdrawn' })
        .eq('id', bid.id);
      if (error) throw error;
      await logAuditEvent('WITHDRAW_BID', 'marketplace_bids', bid.id);
      setSuccess('Bid withdrawn');
      refresh();
      loadBuyerNotificationCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to withdraw bid');
    }
  };

  const openResultsModal = async (listing: ListingWithBatch) => {
    setResultsModalListing(listing);
    setResultsLoading(true);
    setLabResults([]);
    try {
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('processing_batch_id', listing.processing_batch_id)
        .eq('status', 'results_approved');

      const orderIds = (orders || []).map((o: any) => o.id);
      if (orderIds.length === 0) {
        setLabResults([]);
        return;
      }

      const { data: results } = await supabase
        .from('order_results')
        .select(`id, result, approval_status, notes, test:tests!test_id(name, unit_of_measure)`)
        .in('order_id', orderIds)
        .eq('approval_status', 'approved');
      setLabResults(((results as any[]) || []) as LabResult[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lab results');
    } finally {
      setResultsLoading(false);
    }
  };

  const openRespondModal = (bid: Bid & { listing?: ListingWithBatch | null }, action: 'accept' | 'reject') => {
    setRespondModalBid(bid);
    setRespondAction(action);
    setRespondNote('');
  };

  const handleRespond = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respondModalBid) return;
    setResponding(true);
    try {
      const newStatus = respondAction === 'accept' ? 'accepted' : 'rejected';
      const { error: bErr } = await supabase
        .from('marketplace_bids')
        .update({
          status: newStatus,
          response_note: respondNote || null,
          seller_response_at: new Date().toISOString(),
          buyer_seen_response: false,
        })
        .eq('id', respondModalBid.id);
      if (bErr) throw bErr;

      if (respondAction === 'accept' && respondModalBid.listing) {
        await supabase
          .from('marketplace_listings')
          .update({ status: 'sold' })
          .eq('id', respondModalBid.listing_id);

        await supabase
          .from('marketplace_bids')
          .update({
            status: 'rejected',
            response_note: 'Auto-rejected: another bid was accepted',
            seller_response_at: new Date().toISOString(),
            buyer_seen_response: false,
          })
          .eq('listing_id', respondModalBid.listing_id)
          .eq('status', 'pending');
      }

      await logAuditEvent(
        respondAction === 'accept' ? 'ACCEPT_BID' : 'REJECT_BID',
        'marketplace_bids',
        respondModalBid.id,
        { listing_id: respondModalBid.listing_id, response_note: respondNote || null },
      );

      setSuccess(respondAction === 'accept' ? 'Bid accepted' : 'Bid rejected');
      setRespondModalBid(null);
      refresh();
      loadPendingBidsCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond to bid');
    } finally {
      setResponding(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!isAdmin && !isSeller && !isBuyer) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 text-center max-w-md">
          The Marketplace is available to approved Recyclers (sellers) and Packaging Manufacturers
          (buyers).
        </p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; show: boolean; badge?: number }[] = [
    {
      key: 'browse',
      label: 'Browse Lots',
      icon: <Store className="w-4 h-4" />,
      show: isAdmin || isBuyer,
    },
    {
      key: 'my-bids',
      label: 'My Bids',
      icon: <ShoppingBag className="w-4 h-4" />,
      show: isAdmin || isBuyer,
      badge: unseenMyBidsCount || undefined,
    },
    {
      key: 'successful-bids',
      label: 'Successful Bids',
      icon: <CheckCircle2 className="w-4 h-4" />,
      show: isAdmin || isBuyer,
      badge: unseenSuccessfulBidsCount || undefined,
    },
    {
      key: 'my-listings',
      label: 'My Listings',
      icon: <Tag className="w-4 h-4" />,
      show: isAdmin || isSeller,
    },
    {
      key: 'eligible',
      label: 'Eligible Batches',
      icon: <Package className="w-4 h-4" />,
      show: isAdmin || isSeller,
    },
    {
      key: 'bids-received',
      label: 'Bids Received',
      icon: <TrendingUp className="w-4 h-4" />,
      show: isAdmin || isSeller,
      badge: pendingBidsCount || undefined,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      {success && <SuccessNotification message={success} onClose={() => setSuccess(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 rounded-lg">
            <Store className="w-7 h-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
            <p className="text-sm text-gray-500">
              {isSeller && 'Publish lab-tested lots and review bids'}
              {isBuyer && 'Browse anonymous lots and place bids'}
              {isAdmin && !isSeller && !isBuyer && 'Marketplace administration'}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg mb-6 flex items-start justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-rose-700 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex flex-wrap">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === t.key
                      ? 'border-blue-600 text-blue-700 bg-white'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {t.icon}
                  {t.label}
                  {t.badge ? (
                    <span className="ml-1 px-2 py-0.5 text-xs font-semibold bg-rose-500 text-white rounded-full">
                      {t.badge}
                    </span>
                  ) : null}
                </button>
              ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'browse' && (
            <BrowseLots
              listings={activeListings}
              userId={userId}
              isBuyer={isBuyer}
              onView={openResultsModal}
              onBid={openBidModal}
            />
          )}

          {activeTab === 'my-listings' && (
            <MyListings listings={myListings} onWithdraw={handleWithdrawListing} onView={openResultsModal} />
          )}

          {activeTab === 'eligible' && (
            <EligibleBatches batches={eligibleBatches} onPublish={openPublishModal} />
          )}

          {activeTab === 'bids-received' && (
            <BidsReceived bids={bidsReceived} onRespond={openRespondModal} />
          )}

          {activeTab === 'my-bids' && (
            <MyBids bids={myBids} onWithdraw={handleWithdrawBid} />
          )}

          {activeTab === 'successful-bids' && (
            <SuccessfulBids bids={successfulBids} />
          )}
        </div>
      </div>

      {/* Publish Modal */}
      {publishModalBatch && (
        <Modal title="Publish Lot to Marketplace" onClose={() => setPublishModalBatch(null)}>
          <form onSubmit={handlePublish} className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
              <div className="font-medium text-blue-900">{publishModalBatch.intake_batch_reference}</div>
              <div className="text-blue-700 mt-1">
                {publishModalBatch.sorted_intake?.plastic_type_names} —{' '}
                {publishModalBatch.sorted_intake?.grade} — {publishModalBatch.sorted_intake?.colour}
              </div>
              <div className="text-blue-700 mt-0.5">
                Available: {publishModalBatch.post_processing_weight_kg ?? publishModalBatch.original_quantity_kg} kg
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (kg)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={publishQty}
                onChange={(e) => setPublishQty(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Offer Price per kg</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={publishPrice}
                onChange={(e) => setPublishPrice(e.target.value)}
                placeholder="e.g. 1.25"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <ModalActions onCancel={() => setPublishModalBatch(null)} submitting={publishing} submitLabel="Publish" />
          </form>
        </Modal>
      )}

      {/* Bid Modal */}
      {bidModalListing && (
        <Modal title="Place a Bid" onClose={() => setBidModalListing(null)}>
          <form onSubmit={handlePlaceBid} className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm space-y-1">
              <div className="text-blue-900">
                Listed quantity: <span className="font-medium">{bidModalListing.quantity_kg} kg</span>
              </div>
              <div className="text-blue-900">
                Offer price/kg: <span className="font-medium">{bidModalListing.offer_price_per_kg}</span>
              </div>
              <div className="text-blue-700">
                {bidModalListing.batch?.sorted_intake?.plastic_type_names} —{' '}
                {bidModalListing.batch?.sorted_intake?.grade}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bid Quantity (kg)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={bidModalListing.quantity_kg}
                required
                value={bidQty}
                onChange={(e) => setBidQty(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bid Price per kg</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={bidPrice}
                onChange={(e) => setBidPrice(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <ModalActions onCancel={() => setBidModalListing(null)} submitting={bidding} submitLabel="Place Bid" />
          </form>
        </Modal>
      )}

      {/* Lab Results Modal */}
      {resultsModalListing && (
        <Modal title="Lab Test Results" onClose={() => setResultsModalListing(null)} wide>
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
              <div className="font-medium text-gray-900">
                {resultsModalListing.batch?.sorted_intake?.plastic_type_names} —{' '}
                {resultsModalListing.batch?.sorted_intake?.grade}
              </div>
              <div className="text-gray-600 mt-1">
                {resultsModalListing.quantity_kg} kg @ {resultsModalListing.offer_price_per_kg}/kg
              </div>
            </div>
            {resultsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
              </div>
            ) : labResults.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No approved lab results found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Test</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Result</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Unit</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {labResults.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-2 text-gray-900">{r.test?.name ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-900 font-medium">{r.result ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{r.test?.unit_of_measure ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{r.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Respond Modal */}
      {respondModalBid && (
        <Modal
          title={respondAction === 'accept' ? 'Accept Bid' : 'Reject Bid'}
          onClose={() => setRespondModalBid(null)}
        >
          <form onSubmit={handleRespond} className="space-y-4">
            <div
              className={`border rounded-lg p-3 text-sm ${
                respondAction === 'accept'
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                  : 'bg-rose-50 border-rose-100 text-rose-900'
              }`}
            >
              {respondAction === 'accept'
                ? 'Accepting this bid will mark the lot as Sold and auto-reject any other pending bids on this listing.'
                : 'The buyer will see your rejection in their bid history.'}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
              <textarea
                rows={3}
                value={respondNote}
                onChange={(e) => setRespondNote(e.target.value)}
                placeholder="Visible to the buyer"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <ModalActions
              onCancel={() => setRespondModalBid(null)}
              submitting={responding}
              submitLabel={respondAction === 'accept' ? 'Accept Bid' : 'Reject Bid'}
              variant={respondAction === 'accept' ? 'primary' : 'danger'}
            />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({
  onCancel,
  submitting,
  submitLabel,
  variant = 'primary',
}: {
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
  variant?: 'primary' | 'danger';
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 ${
          variant === 'danger'
            ? 'bg-rose-600 hover:bg-rose-700'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {submitting ? 'Saving...' : submitLabel}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 text-gray-500 mb-3">
        {icon}
      </div>
      <h3 className="text-base font-medium text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}

function BrowseLots({
  listings,
  userId,
  isBuyer,
  onView,
  onBid,
}: {
  listings: ListingWithBatch[];
  userId: string | null;
  isBuyer: boolean;
  onView: (l: ListingWithBatch) => void;
  onBid: (l: ListingWithBatch) => void;
}) {
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={<Store className="w-6 h-6" />}
        title="No active lots"
        description="There are currently no lots for sale on the marketplace."
      />
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {listings.map((l) => {
        const isOwn = l.seller_id === userId;
        return (
          <div
            key={l.id}
            className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow bg-white flex flex-col"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-gray-900">
                  {l.batch?.sorted_intake?.plastic_type_names ?? '—'}
                </span>
              </div>
              <StatusBadge status={l.status} />
            </div>
            <div className="text-sm text-gray-600 space-y-1 mb-4 flex-1">
              <div>Grade: <span className="font-medium text-gray-900">{l.batch?.sorted_intake?.grade ?? '—'}</span></div>
              <div>Colour: <span className="font-medium text-gray-900">{l.batch?.sorted_intake?.colour ?? '—'}</span></div>
              <div>Quantity: <span className="font-medium text-gray-900">{l.quantity_kg} kg</span></div>
              <div className="pt-1 text-lg font-bold text-blue-700">
                {l.offer_price_per_kg} <span className="text-sm font-normal text-gray-500">/ kg</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onView(l)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <Eye className="w-4 h-4" />
                Lab Results
              </button>
              {isBuyer && !isOwn && (
                <button
                  onClick={() => onBid(l)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-md hover:bg-blue-700"
                >
                  <Send className="w-4 h-4" />
                  Place Bid
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MyListings({
  listings,
  onWithdraw,
  onView,
}: {
  listings: ListingWithBatch[];
  onWithdraw: (l: ListingWithBatch) => void;
  onView: (l: ListingWithBatch) => void;
}) {
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={<Tag className="w-6 h-6" />}
        title="No listings yet"
        description="Publish a lab-tested batch from the Eligible Batches tab to start selling."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-700">Batch</th>
            <th className="px-4 py-2 text-left font-medium text-gray-700">Plastic</th>
            <th className="px-4 py-2 text-left font-medium text-gray-700">Quantity</th>
            <th className="px-4 py-2 text-left font-medium text-gray-700">Price/kg</th>
            <th className="px-4 py-2 text-left font-medium text-gray-700">Bids</th>
            <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
            <th className="px-4 py-2 text-right font-medium text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {listings.map((l) => (
            <tr key={l.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-mono text-xs text-gray-700">
                {l.batch?.intake_batch_reference ?? '—'}
              </td>
              <td className="px-4 py-2">
                {l.batch?.sorted_intake?.plastic_type_names ?? '—'} /{' '}
                {l.batch?.sorted_intake?.grade ?? '—'}
              </td>
              <td className="px-4 py-2">{l.quantity_kg} kg</td>
              <td className="px-4 py-2">{l.offer_price_per_kg}</td>
              <td className="px-4 py-2">{l.bid_count ?? 0}</td>
              <td className="px-4 py-2">
                <StatusBadge status={l.status} />
              </td>
              <td className="px-4 py-2 text-right space-x-2">
                <button onClick={() => onView(l)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                  Results
                </button>
                {l.status === 'active' && (
                  <button
                    onClick={() => onWithdraw(l)}
                    className="text-rose-600 hover:text-rose-800 text-sm font-medium"
                  >
                    Withdraw
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EligibleBatches({
  batches,
  onPublish,
}: {
  batches: BatchWithSorted[];
  onPublish: (b: BatchWithSorted) => void;
}) {
  if (batches.length === 0) {
    return (
      <EmptyState
        icon={<Package className="w-6 h-6" />}
        title="No eligible batches"
        description="Batches appear here once lab testing is complete (at least one order with approved results) and not already listed."
      />
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {batches.map((b) => (
        <div key={b.id} className="border border-gray-200 rounded-xl p-4 bg-white">
          <div className="font-mono text-xs text-gray-500 mb-1">{b.intake_batch_reference}</div>
          <div className="text-base font-semibold text-gray-900 mb-2">
            {b.sorted_intake?.plastic_type_names ?? '—'} — {b.sorted_intake?.grade ?? '—'}
          </div>
          <div className="text-sm text-gray-600 space-y-0.5 mb-4">
            <div>Colour: {b.sorted_intake?.colour ?? '—'}</div>
            <div>Available: {b.post_processing_weight_kg ?? b.original_quantity_kg} kg</div>
            <div>Lab tests: <span className="text-emerald-700 font-medium">Approved</span></div>
          </div>
          <button
            onClick={() => onPublish(b)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            <Tag className="w-4 h-4" />
            Publish to Marketplace
          </button>
        </div>
      ))}
    </div>
  );
}

function BidsReceived({
  bids,
  onRespond,
}: {
  bids: (Bid & { listing?: ListingWithBatch | null })[];
  onRespond: (b: Bid & { listing?: ListingWithBatch | null }, action: 'accept' | 'reject') => void;
}) {
  if (bids.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="w-6 h-6" />}
        title="No bids yet"
        description="When buyers bid on your listings, the bids appear here."
      />
    );
  }
  return (
    <div className="space-y-3">
      {bids.map((b) => (
        <div key={b.id} className="border border-gray-200 rounded-lg p-4 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm text-gray-500">
                Lot:{' '}
                <span className="font-mono text-xs text-gray-700">
                  {b.listing?.batch?.intake_batch_reference ?? '—'}
                </span>{' '}
                — {b.listing?.batch?.sorted_intake?.plastic_type_names ?? '—'} /{' '}
                {b.listing?.batch?.sorted_intake?.grade ?? '—'}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="text-base">
                  <span className="text-gray-500 text-sm">Bid:</span>{' '}
                  <span className="font-semibold text-gray-900">{b.bid_quantity_kg} kg</span>{' '}
                  <span className="text-gray-500 text-sm">@</span>{' '}
                  <span className="font-semibold text-blue-700">{b.bid_price_per_kg}/kg</span>
                </div>
                <div className="text-xs text-gray-500">
                  Listed: {b.listing?.quantity_kg} kg @ {b.listing?.offer_price_per_kg}/kg
                </div>
                <StatusBadge status={b.status} />
              </div>
              {b.response_note && (
                <div className="mt-2 text-xs text-gray-600 italic">Note: {b.response_note}</div>
              )}
            </div>
            {b.status === 'pending' && (
              <div className="flex gap-2">
                <button
                  onClick={() => onRespond(b, 'accept')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Accept
                </button>
                <button
                  onClick={() => onRespond(b, 'reject')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function MyBids({
  bids,
  onWithdraw,
}: {
  bids: BidWithListing[];
  onWithdraw: (b: Bid) => void;
}) {
  if (bids.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="w-6 h-6" />}
        title="No bids placed"
        description="Browse the marketplace to find lots and place bids."
      />
    );
  }
  return (
    <div className="space-y-3">
      {bids.map((b) => (
        <div
          key={b.id}
          className={`border rounded-lg p-4 ${
            b.status === 'accepted'
              ? 'bg-emerald-50 border-emerald-200'
              : b.status === 'rejected'
              ? 'bg-gray-50 border-gray-200'
              : 'bg-white border-gray-200'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm text-gray-500">
                {b.listing?.batch?.sorted_intake?.plastic_type_names ?? '—'} /{' '}
                {b.listing?.batch?.sorted_intake?.grade ?? '—'}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <div className="text-base">
                  <span className="text-gray-500 text-sm">Your bid:</span>{' '}
                  <span className="font-semibold text-gray-900">{b.bid_quantity_kg} kg</span>{' '}
                  <span className="text-gray-500 text-sm">@</span>{' '}
                  <span className="font-semibold text-blue-700">{b.bid_price_per_kg}/kg</span>
                </div>
                <StatusBadge status={b.status} />
                {b.status === 'accepted' && (
                  <span className="inline-flex items-center text-xs text-emerald-700">
                    <Clock className="w-3 h-3 mr-1" /> Awaiting fulfilment
                  </span>
                )}
              </div>
              {b.response_note && (
                <div className="mt-2 text-sm text-gray-700 bg-white border border-gray-200 rounded px-3 py-2">
                  Seller note: {b.response_note}
                </div>
              )}
            </div>
            {b.status === 'pending' && (
              <button
                onClick={() => onWithdraw(b)}
                className="text-sm font-medium text-rose-600 hover:text-rose-800"
              >
                Withdraw
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SuccessfulBids({ bids }: { bids: BidWithListing[] }) {
  if (bids.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="w-6 h-6" />}
        title="No successful bids yet"
        description="Accepted bids will appear here. Browse lots to place new bids."
      />
    );
  }
  return (
    <div className="space-y-3">
      {bids.map((b) => (
        <div
          key={b.id}
          className="border border-emerald-200 bg-emerald-50 rounded-lg p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm text-gray-700 font-medium">
                {b.listing?.batch?.intake_batch_reference ?? '—'}
              </div>
              <div className="text-sm text-gray-500">
                {b.listing?.batch?.sorted_intake?.plastic_type_names ?? '—'} /{' '}
                {b.listing?.batch?.sorted_intake?.grade ?? '—'}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="text-base">
                  <span className="text-gray-500 text-sm">Agreed:</span>{' '}
                  <span className="font-semibold text-gray-900">{b.bid_quantity_kg} kg</span>{' '}
                  <span className="text-gray-500 text-sm">@</span>{' '}
                  <span className="font-semibold text-emerald-700">{b.bid_price_per_kg}/kg</span>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Accepted
                </span>
                {b.seller_response_at && (
                  <span className="text-xs text-gray-500">
                    Accepted on {new Date(b.seller_response_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              {b.response_note && (
                <div className="mt-2 text-sm text-gray-700 bg-white border border-emerald-200 rounded px-3 py-2">
                  Seller note: {b.response_note}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
