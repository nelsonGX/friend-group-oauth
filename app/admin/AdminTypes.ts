export interface AdminUserRow {
  id: string;
  discordId: string;
  name: string;
  avatar: string | null;
  isAdmin: boolean;
  allowed: boolean;
  balance: number;
  isSelf: boolean;
}

export interface AdminProviderRow {
  id: string;
  name: string;
  clientId: string;
  scopes: string[];
  earned: number;
  isActive: boolean;
  trusted: boolean;
  listed: boolean;
}

export interface AdminRedeemRow {
  id: string;
  code: string;
  amount: number;
  redemptionCount: number;
  maxRedemptions: number | null;
  expires: string | null;
  expired: boolean;
  active: boolean;
}

export interface AdminWithdrawalView {
  id: string;
  userName: string;
  userDiscordId: string;
  avatar: string | null;
  amount: number;
  payoutDetails: string;
  note: string | null;
  status: string;
  adminNote: string | null;
  requested: string;
  processed: string | null;
}
