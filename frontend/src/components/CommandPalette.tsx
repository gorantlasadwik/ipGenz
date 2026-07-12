"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  Tv,
  Film,
  MonitorPlay,
  Download,
  Heart,
  Clock,
  ListVideo,
  Settings,
  LogOut,
  User
} from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("profileId")
    localStorage.removeItem("isDemo")
    localStorage.removeItem("isSrk")
    router.push("/login")
  }

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search movies, series, channels, or settings..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          
          <CommandGroup heading="Quick Navigation">
            <CommandItem>
              <Tv className="mr-2 h-4 w-4" />
              <span>Live TV</span>
            </CommandItem>
            <CommandItem>
              <Film className="mr-2 h-4 w-4" />
              <span>Movies</span>
            </CommandItem>
            <CommandItem>
              <MonitorPlay className="mr-2 h-4 w-4" />
              <span>Series</span>
            </CommandItem>
          </CommandGroup>
          
          <CommandSeparator />
          
          <CommandGroup heading="Library">
            <CommandItem>
              <Heart className="mr-2 h-4 w-4" />
              <span>Favorites</span>
            </CommandItem>
            <CommandItem>
              <Clock className="mr-2 h-4 w-4" />
              <span>Watch Later</span>
            </CommandItem>
            <CommandItem>
              <Download className="mr-2 h-4 w-4" />
              <span>Downloads</span>
            </CommandItem>
            <CommandItem>
              <ListVideo className="mr-2 h-4 w-4" />
              <span>Playlists</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />
          
          <CommandGroup heading="Settings">
            <CommandItem>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
              <CommandShortcut>⌘P</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
