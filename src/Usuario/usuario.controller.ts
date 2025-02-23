import { Request, Response, NextFunction } from 'express';
import { ORM } from '../shared/db/orm.js';
import { Usuario } from './usuario.entity.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const em = ORM.em;

function sanitizeUsuarioInput(req: Request, res: Response, next: NextFunction) {
  req.body.sanitizedInput = {
    id: req.body.id,
    nombre: req.body.nombre,
    apellido: req.body.apellido,
    email: req.body.email,
    nroTelefono: req.body.nroTelefono,
    contrasenia: req.body.contrasenia,
    mascotas: req.body.mascotas,
    turnos: req.body.turnos,
    calificaciones: req.body.calificaciones,
  };

  // Eliminar propiedades indefinidas
  Object.keys(req.body.sanitizedInput).forEach((key) => {
    if (req.body.sanitizedInput[key] === undefined) {
      delete req.body.sanitizedInput[key];
    }
  });

  next();
}

async function findAll(req: Request, res: Response) {
  try {
    const usuarios = await em.find(Usuario, {}, { populate: ['mascotas'] }); // Poblar mascotas
    res.status(200).json({ message: 'found all usuarios', data: usuarios });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

async function findOne(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id);
    const usuario = await em.findOneOrFail(
      Usuario,
      { id },
      { populate: ['mascotas'] }
    ); // Poblar mascotas
    res.status(200).json({ message: 'found usuario', data: usuario });
  } catch (error: any) {
    if (error.name === 'EntityNotFound') {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.status(500).json({ message: error.message });
  }
}

async function add(req: Request, res: Response) {
  try {
    // Verifica si ya existe un usuario con el mismo email
    const existingUser = await em.findOne(Usuario, {
      email: req.body.sanitizedInput.email,
    });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    //Encriptar la contraseña
    const hashedPassword = await bcrypt.hash(
      req.body.sanitizedInput.contrasenia,
      10
    );
    (req.body.sanitizedInput.contrasenia = hashedPassword),
      (req.body.sanitizedInput.mascotas = []); // Inicializa la colección vacía;
    const usuario = em.create(Usuario, req.body.sanitizedInput);
    await em.flush();
    res.status(201).json({ message: 'Usuario created', data: usuario });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

async function login(req: Request, res: Response) {
  try {
    const { email, contrasenia } = req.body;

    // Verificar si el usuario existe
    const usuario = await em.findOne(Usuario, { email });
    if (!usuario) {
      return res.status(400).json({ message: 'Usuario no encontrado' });
    }

    // Comparar contraseñas
    const validPassword = await bcrypt.compare(
      contrasenia,
      usuario.contrasenia
    );
    if (!validPassword) {
      return res.status(400).json({ message: 'Contraseña incorrecta' });
    }

    // Crear un token JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email }, // Payload
      'tu_clave_secreta', // Clave secreta (debes almacenarla de forma segura)
      { expiresIn: '1h' } // Opciones del token (ej. caduca en 1 hora)
    );

    // Retornar usuario y token
    res.status(200).json({
      message: 'Login exitoso',
      data: {
        email: usuario.email,
        token,
        usuarioId: usuario.id,
      },
    }); // Asegúrate de devolver el email correcto
  } catch (error: any) {
    res
      .status(500)
      .json({ message: 'Error interno del servidor', error: error.message });
  }
}

async function update(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id);
    const usuarioToUpdate = await em.findOneOrFail(Usuario, { id });
    em.assign(usuarioToUpdate, req.body.sanitizedInput);
    await em.flush();
    res.status(200).json({ message: 'usuario updated', data: usuarioToUpdate });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

async function remove(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id);
    const usuario = em.getReference(Usuario, id);
    await em.removeAndFlush(usuario);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

export { sanitizeUsuarioInput, findAll, remove, update, findOne, add, login };
