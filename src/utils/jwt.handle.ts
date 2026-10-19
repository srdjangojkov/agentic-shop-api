import { sign, verify } from 'jsonwebtoken';

const JWT_SECRET = process?.env?.SECRET_JWT || 'secret.TOken.33244ftm';
const REFRESH_TOKEN_SECRET =
	process?.env?.SECRET_REFRESH_JWT || 'refresh.TOken.0099abc';

const generateAccessToken = async (id: string) => {
	return sign({ id }, JWT_SECRET, { expiresIn: '1h' });
};

const generateRefreshToken = async (id: string) => {
	return sign({ id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
};

const verifyAccessToken = (jwt: string) => {
	const isTokenOk = verify(jwt, JWT_SECRET);
	return isTokenOk;
};

const verifyRefreshToken = (token: string) => {
	return verify(token, REFRESH_TOKEN_SECRET);
};

export {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
