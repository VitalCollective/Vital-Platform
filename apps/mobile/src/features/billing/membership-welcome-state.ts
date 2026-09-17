export type MembershipWelcomeState = {
  userId: string | null;
  checked: boolean;
  checking: boolean;
  visible: boolean;
};

export type MembershipWelcomeAction =
  | { type: 'session'; userId: string | null }
  | { type: 'checking' }
  | { type: 'resolved'; userId: string; claimed: boolean }
  | { type: 'dismissed' };

export const EMPTY_MEMBERSHIP_WELCOME: MembershipWelcomeState = {
  userId: null,
  checked: false,
  checking: false,
  visible: false,
};

export function membershipWelcomeReducer(
  state: MembershipWelcomeState,
  action: MembershipWelcomeAction,
): MembershipWelcomeState {
  if (action.type === 'session') {
    return action.userId === state.userId
      ? state
      : { ...EMPTY_MEMBERSHIP_WELCOME, userId: action.userId };
  }
  if (action.type === 'checking') {
    return state.checked || state.checking ? state : { ...state, checking: true };
  }
  if (action.type === 'resolved') {
    return action.userId === state.userId
      ? { ...state, checked: true, checking: false, visible: action.claimed }
      : state;
  }
  return { ...state, checked: true, checking: false, visible: false };
}
