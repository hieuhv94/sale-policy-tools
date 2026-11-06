import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/phong.css';
import './styles/tokens.css';
import './styles/app.css';
import { PhienProvider } from './lib/auth.js';
import { BaoLoiProvider } from './lib/bao-loi.js';
import { BoDinhTuyen } from './lib/router.js';
import { App } from './App.js';

/*
 * `BaoLoiProvider` bọc NGOÀI `PhienProvider` (`0088`).
 *
 * Việc đăng nhập và việc khôi phục phiên cũng báo lỗi, nên cửa báo lỗi phải có
 * mặt trước chúng. Đặt bên trong thì đúng những lỗi sớm nhất — lúc người dùng
 * chưa thấy gì trên màn hình — lại là những lỗi không có chỗ nào hiện ra.
 */
createRoot(document.getElementById('goc')!).render(
  <StrictMode>
    <BaoLoiProvider>
      <PhienProvider>
        <BoDinhTuyen>
          <App />
        </BoDinhTuyen>
      </PhienProvider>
    </BaoLoiProvider>
  </StrictMode>,
);
