import {
  createElement,
  type IconNode,
  BarChart3,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleArrowRight,
  CirclePlus,
  Clock,
  CloudOff,
  CloudUpload,
  Copy,
  Crown,
  Download,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  Hand,
  HelpCircle,
  Home,
  Languages,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessageSquare,
  Mic,
  Moon,
  Pause,
  PenLine,
  Pencil,
  Play,
  Plus,
  Presentation,
  Rows2,
  Share2,
  ShieldOff,
  Speech,
  Square,
  Sun,
  Target,
  Timer,
  TimerReset,
  Trash2,
  UserPlus,
  Users,
  Vibrate,
  VibrateOff,
  Volume2,
  VolumeX,
  X,
} from "lucide";

// Explicit map so Vite tree-shakes the ~1500 unused Lucide icons. The
// dynamic-access pattern (icons[name]) used to pull the entire library
// into the initial bundle.
const ICONS = {
  BarChart3,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleArrowRight,
  CirclePlus,
  Clock,
  CloudOff,
  CloudUpload,
  Copy,
  Crown,
  Download,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  Hand,
  HelpCircle,
  Home,
  Languages,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessageSquare,
  Mic,
  Moon,
  Pause,
  PenLine,
  Pencil,
  Play,
  Plus,
  Presentation,
  Rows2,
  Share2,
  ShieldOff,
  Speech,
  Square,
  Sun,
  Target,
  Timer,
  TimerReset,
  Trash2,
  UserPlus,
  Users,
  Vibrate,
  VibrateOff,
  Volume2,
  VolumeX,
  X,
} satisfies Record<string, IconNode>;

type Name = keyof typeof ICONS;

// Always decorative: the control carrying the icon owns the accessible name.
interface Options {
  size?: number;
  className?: string;
}

export function icon(name: Name, opts: Options = {}): SVGElement {
  const svg = createElement(ICONS[name]);
  svg.setAttribute("width", String(opts.size ?? 20));
  svg.setAttribute("height", String(opts.size ?? 20));
  if (opts.className) svg.setAttribute("class", opts.className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  return svg;
}
