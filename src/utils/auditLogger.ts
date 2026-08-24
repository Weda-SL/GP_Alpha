import { supabase } from '../lib/supabase';

interface AuditLogDetails {
  [key: string]: any;
}

/**
 * Logs an audit event to the database
 * @param action - The action being performed (e.g., 'LOGIN_SUCCESS', 'CREATE_TEST')
 * @param entityType - Optional type of entity affected (e.g., 'users', 'tests')
 * @param entityId - Optional ID of the entity affected
 * @param details - Optional additional details about the action
 */
export async function logAuditEvent(
  action: string,
  entityType?: string,
  entityId?: string,
  details?: AuditLogDetails
): Promise<void> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return;
    }

    const { error } = await supabase.rpc('log_audit_event', {
      p_user_id: user.id,
      p_action: action,
      p_entity_type: entityType || null,
      p_entity_id: entityId || null,
      p_details: details ? JSON.stringify(details) : null
    });

    if (error) {
      console.error('Error logging audit event:', error);
    }
  } catch (err) {
    console.error('Unexpected error in audit logging:', err);
  }
}