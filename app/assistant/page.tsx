import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import AssistantUI from './assistant-ui';
export const dynamic = 'force-dynamic';
export default async function Page(){const session=await currentSession();if(!session)redirect('/login');return <AssistantUI/>;}
