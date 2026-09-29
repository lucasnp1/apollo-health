import { Keyboard, Upload } from 'lucide-react'
import { FeedList, FeedRow } from './FeedList'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** The two ways into Bloods: import a report (Pro), or type the results in. */
export function AddResultsSheet({ open, isPro, onImport, onManual, onClose }: {
  open: boolean
  isPro: boolean
  onImport: () => void
  onManual: () => void
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add results</DialogTitle>
          <DialogDescription>Each test is kept as its own dated report.</DialogDescription>
        </DialogHeader>
        <FeedList>
          <FeedRow
            icon={Upload}
            title="Import a PDF or photo"
            sub="Magno reads the values, units and ranges"
            status={isPro ? undefined : { label: 'Pro', tone: 'neutral' }}
            onClick={onImport}
          />
          <FeedRow icon={Keyboard} title="Type results in" sub="From a printed or emailed report" onClick={onManual} />
        </FeedList>
      </DialogContent>
    </Dialog>
  )
}
