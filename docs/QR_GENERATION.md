# Dynamic QR Generation

QR payload must contain only `room_code`.

## Steps
1. After event configuration, export room codes from Supabase:
```sql
select room_code
from rooms
where event_config_id = (select active_event_id from event_state where id = 1)
order by is_entry desc, path_id nulls last, order_number nulls last, room_number;
```
2. Save output as `backend/room-codes.txt` (one code per line).
3. Generate QR images:
```bash
cd backend
npm run qr:generate -- ./room-codes.txt
```
4. Print and label cards with human-readable room names.
5. Mandatory final-stage QRs are auto-generated in Admin `ops-package` and printable from Admin UI:
   - `EVENT_ID-FINAL-KEY-NEXUS`
   - `EVENT_ID-FINAL-KEY-AMIPHORIA`
   - `EVENT_ID-RAPID-FIRE-QR`
