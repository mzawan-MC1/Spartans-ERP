import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { MapPin, Phone, Mail, Pencil, Trash2, Users } from 'lucide-react';

const locationImages = [
  'https://images.unsplash.com/photo-1592051610978-672b8b817647?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHwxfHxtYXJ0aWFsJTIwYXJ0cyUyMGd5bSUyMGludGVyaW9yJTIwZGFyayUyMG1vb2R5fGVufDB8fHx8MTc3MDgzNzgyOXww&ixlib=rb-4.1.0&q=85',
  'https://images.unsplash.com/photo-1711825051467-fda9d8abea58?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NjZ8MHwxfHNlYXJjaHwyfHxib3hpbmclMjByaW5nJTIwZGFyayUyMG1vb2R5fGVufDB8fHx8MTc3MDgzNzgyOXww&ixlib=rb-4.1.0&q=85',
  'https://images.unsplash.com/photo-1632174400121-02726ed4dc7c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NjZ8MHwxfHNlYXJjaHwxfHxib3hpbmclMjByaW5nJTIwZGFyayUyMG1vb2R5fGVufDB8fHx8MTc3MDgzNzgyOXww&ixlib=rb-4.1.0&q=85',
];

export default function LocationCard({ location, index = 0, onDelete }) {
  const navigate = useNavigate();
  const imageUrl = locationImages[index % locationImages.length];

  return (
    <div
      data-testid={`location-card-${location.location_id}`}
      className="group relative overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-red-600/50 transition-all duration-300 rounded-sm flex flex-col hover:scale-[1.01] cursor-pointer"
      style={{ animationDelay: `${index * 100}ms` }}
      onClick={() => navigate(`/owner/locations/${location.location_id}`)}
    >
      {/* Image Header */}
      <div className="relative h-40 overflow-hidden">
        <img
          src={imageUrl}
          alt={location.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
        
        {/* Status Badge */}
        <div className="absolute top-3 right-3">
          <Badge
            data-testid={`location-status-${location.location_id}`}
            className={`rounded-sm font-heading uppercase tracking-wider text-[10px] px-2 py-0.5 border-0 ${
              location.status === 'active'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-zinc-700/50 text-zinc-400'
            }`}
          >
            {location.status}
          </Badge>
        </div>

        {/* City Tag */}
        <div className="absolute bottom-3 left-3">
          <span className="inline-flex items-center gap-1 text-xs text-zinc-300 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-sm">
            <MapPin className="w-3 h-3" strokeWidth={1.5} />
            {location.city}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wide mb-3 leading-tight">
          {location.name}
        </h3>

        <div className="space-y-2 mb-4 flex-1">
          {location.address && (
            <p className="text-zinc-500 text-sm font-body flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />
              {location.address}
            </p>
          )}
          {location.phone && (
            <p className="text-zinc-500 text-sm font-body flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
              {location.phone}
            </p>
          )}
          {location.email && (
            <p className="text-zinc-500 text-sm font-body flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
              {location.email}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t border-zinc-800">
          <button
            data-testid={`edit-location-${location.location_id}`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/locations/${location.location_id}/edit`);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 bg-transparent border border-zinc-700 text-zinc-300 hover:border-red-600 hover:text-white font-heading uppercase tracking-wide px-3 py-1.5 rounded-sm text-xs transition-all duration-200"
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
            Edit
          </button>
          <button
            data-testid={`view-users-${location.location_id}`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/users?location_id=${location.location_id}`);
            }}
            className="flex items-center justify-center gap-1.5 bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white px-3 py-1.5 rounded-sm text-xs transition-all duration-200"
            title="View Users"
          >
            <Users className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            data-testid={`delete-location-${location.location_id}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(location);
            }}
            className="flex items-center justify-center gap-1.5 bg-transparent border border-zinc-700 text-zinc-400 hover:border-red-800 hover:text-red-400 hover:bg-red-600/5 px-3 py-1.5 rounded-sm text-xs transition-all duration-200"
            title="Delete Location"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
