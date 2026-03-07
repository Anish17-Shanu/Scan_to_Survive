import { Navigate } from "react-router-dom";
import { getRole, getToken } from "../lib/auth";

type Props = {
  allowedRole: "team" | "admin" | Array<"team" | "admin">;
  children: JSX.Element;
};

export function ProtectedRoute({ allowedRole, children }: Props) {
  const token = getToken();
  const role = getRole();
  const allowed = Array.isArray(allowedRole) ? allowedRole : [allowedRole];

  if (!token || !role || !allowed.includes(role)) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
