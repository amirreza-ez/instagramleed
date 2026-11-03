import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Member { userId: string; name: string; email: string; role: string; active: boolean; lastLoginAt?: string; joinedAt: string }
export interface Category { id: string; name: string; color: string; leadCount: number; sortOrder: number }
export const useMembers = () => useQuery({ queryKey: ['members'], queryFn: () => api<Member[]>('/org/members'), staleTime: 60_000 });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/org/categories'), staleTime: 60_000 });
export const useCampaigns = () => useQuery({ queryKey: ['campaigns'], queryFn: () => api<any[]>('/campaigns'), staleTime: 30_000 });
export const useCities = () => useQuery({ queryKey: ['cities'], queryFn: () => api<{ city: string; count: number }[]>('/leads/meta/cities'), staleTime: 60_000 });
