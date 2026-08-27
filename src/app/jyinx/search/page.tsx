'use client';
import { OnlineCodeSearch, type OnlineCodeResult } from '@/components/ide/OnlineCodeSearch';

export default function JyinxSearchPage() {
  return (
    <div className='flex h-screen bg-background'>
      <OnlineCodeSearch
        onSend={(result: OnlineCodeResult) => {
          console.log('Code selected:', result);
        }}
      />
    </div>
  );
}

